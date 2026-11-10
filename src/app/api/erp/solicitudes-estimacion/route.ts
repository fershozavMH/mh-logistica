import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verificarPeticionERP, leerJSON, respuestaError, mensajeValidacion, ipDe } from "@/lib/erp-auth";
import { textoCorto, monto } from "@/lib/validacion";
import { registrarAuditoria } from "@/lib/audit";

// POST /api/erp/solicitudes-estimacion
// El ERP lo llama cuando Compras pulsa "Solicitar estimación a Logística" en
// el equipo (todavía sin comprar). Jaime y Raúl la ven en "Por cotizar".
// Requiere: Authorization: Bearer <MH_LOGISTICA_TOKEN>
//
// {
//   "erpEquipoId": "EQUI-002077",              // obligatorio — equipo en el ERP
//   "equipoDescripcion": "Trompo Revolvedor 2007 Peterbilt 357",
//   "serie": "9698",
//   "proveedor": "RITCHIE BROS AUCTIONEERS",
//   "origenCiudad": "Houston, TX",
//   "precioCompra": 21025.00,
//   "comprador": "Josue Acosta",
//   "solicitadoPor": "Nombre de quien la pidió",
//   "notas": "Comentarios para Logística",
//   "cancelar": false                           // true = Compras canceló la solicitud
// }
//
// Upsert por erpEquipoId: un reenvío no duplica. Si el equipo ya estaba
// estimado y Compras vuelve a pedir, la solicitud se reabre (queda
// Pendiente, conservando el estimado anterior a la vista). Con
// "cancelar": true pasa a Cancelada.
//
// Respuesta: { "ok": true, "id": "<id interno>", "estatus": "Pendiente", "creada": true }

const solicitudSchema = z.object({
  erpEquipoId: z.string({ message: "es obligatorio" }).trim().min(1, "es obligatorio").max(100),
  equipoDescripcion: textoCorto(),
  serie: textoCorto(100),
  proveedor: textoCorto(),
  origenCiudad: textoCorto(150),
  precioCompra: monto.optional(),
  comprador: textoCorto(150),
  solicitadoPor: textoCorto(150),
  notas: textoCorto(1000),
  cancelar: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const bloqueo = verificarPeticionERP(req);
  if (bloqueo) return bloqueo;

  const leido = await leerJSON(req);
  if (!leido.ok) return leido.res;

  const parsed = solicitudSchema.safeParse(leido.body);
  if (!parsed.success) {
    return respuestaError(400, `Datos inválidos — ${mensajeValidacion(parsed.error.issues)}`);
  }
  const { cancelar, ...d } = parsed.data;

  try {
    const existente = await prisma.solicitudEstimacion.findUnique({ where: { erpEquipoId: d.erpEquipoId } });

    if (cancelar) {
      if (!existente) return respuestaError(404, `No hay solicitud para el equipo ${d.erpEquipoId}.`);
      const s = await prisma.solicitudEstimacion.update({
        where: { erpEquipoId: d.erpEquipoId },
        data: { estatus: "Cancelada" },
      });
      await registrarAuditoria({
        accion: "erp.entrante.estimacion.cancelar",
        entidad: "SolicitudEstimacion",
        entidadId: d.erpEquipoId,
        usuario: "ERP",
        httpStatus: 200,
        detalle: `desde ${ipDe(req)}`,
      });
      revalidatePath("/por-cotizar");
      return NextResponse.json(
        { ok: true, id: s.id, estatus: s.estatus, creada: false },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const campos = {
      equipoDescripcion: d.equipoDescripcion,
      serie: d.serie,
      proveedor: d.proveedor,
      origenCiudad: d.origenCiudad,
      precioCompra: d.precioCompra,
      comprador: d.comprador,
      solicitadoPor: d.solicitadoPor,
      notas: d.notas,
    };

    const solicitud = existente
      ? await prisma.solicitudEstimacion.update({
          where: { erpEquipoId: d.erpEquipoId },
          data: { ...campos, estatus: "Pendiente" },
        })
      : await prisma.solicitudEstimacion.create({
          data: {
            ...campos,
            erpEquipoId: d.erpEquipoId,
            equipoDescripcion: d.equipoDescripcion ?? "Equipo sin descripción",
          },
        });

    await registrarAuditoria({
      accion: existente ? "erp.entrante.estimacion.reabrir" : "erp.entrante.estimacion.crear",
      entidad: "SolicitudEstimacion",
      entidadId: d.erpEquipoId,
      usuario: "ERP",
      httpStatus: existente ? 200 : 201,
      detalle: `desde ${ipDe(req)}`,
    });

    revalidatePath("/por-cotizar");

    return NextResponse.json(
      { ok: true, id: solicitud.id, estatus: solicitud.estatus, creada: !existente },
      { status: existente ? 200 : 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[api/erp/solicitudes-estimacion]", err);
    await registrarAuditoria({
      accion: "erp.entrante.estimacion.error",
      entidad: "SolicitudEstimacion",
      entidadId: d.erpEquipoId,
      usuario: "ERP",
      httpStatus: 500,
      detalle: err instanceof Error ? err.message : "Error desconocido",
    });
    return respuestaError(500, "Error interno al guardar la solicitud en MH Logística.");
  }
}
