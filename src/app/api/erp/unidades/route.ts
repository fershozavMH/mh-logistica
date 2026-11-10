import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { normalizarFoto } from "@/lib/imagenes";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { verificarPeticionERP, leerJSON, respuestaError, mensajeValidacion, ipDe } from "@/lib/erp-auth";
import { textoCorto, fechaISO, monto } from "@/lib/validacion";
import { registrarAuditoria } from "@/lib/audit";

// POST /api/erp/unidades
// El ERP lo llama cuando Compras da clic en "Enviar a Logística" en el Trato.
// Requiere: Authorization: Bearer <MH_LOGISTICA_TOKEN>
//
// {
//   "erpId": "MH00250",                         // obligatorio — Trato en el ERP
//   "equipoDescripcion": "Retroexcavadora CAT 420F",
//   "categoria": "Retroexcavadora",
//   "serie": "CAT0420FXXXX",
//   "cliente": "Constructora X",                // "Inventario" si es de inventario
//   "vendedor": "Nombre del vendedor",
//   "origenCiudad": "Houston, TX",
//   "proveedorCompra": "Proveedor SA",
//   "proveedorCompraId": "PROV-0001",           // ID del proveedor en el ERP
//   "fechaInicio": "2026-10-29",
//   "fotoUrl": "data:image/jpeg;base64,..."     // hasta ~1.5 MB
// }
//
// Upsert por erpId: si ya existe una unidad con ese erpId se actualiza (solo
// los campos que vienen; nunca se le cambia el estatus ni el folio), si no,
// se crea en "Pendiente". Un reenvío nunca duplica.
//
// Respuesta: { "ok": true, "id": "<id interno>", "folio": "MH-2026-0001", "creado": true }

const MAX_FOTO = 3 * 1024 * 1024;

const unidadSchema = z.object({
  erpId: z.string({ message: "es obligatorio" }).trim().min(1, "es obligatorio").max(100),
  equipoDescripcion: textoCorto(),
  categoria: textoCorto(100),
  tipoUnidad: textoCorto(50),
  serie: textoCorto(100),
  cliente: textoCorto(),
  vendedor: textoCorto(150),
  origenCiudad: textoCorto(150),
  aduana: textoCorto(150),
  destinoCiudad: textoCorto(150),
  proveedorCompra: textoCorto(),
  proveedorCompraId: textoCorto(100),
  provFleteUSA: textoCorto(),
  provAgenteAduanal: textoCorto(),
  fechaInicio: fechaISO.optional(),
  fechaSalidaProgramada: fechaISO.optional(),
  millas: monto.optional(),
  fotoUrl: z
    .string()
    .max(MAX_FOTO, "la foto excede 3 MB")
    .regex(/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\s]+$/, "debe ser una data URL de imagen (data:image/jpeg;base64,...)")
    .optional(),
});

async function nextFolio() {
  const last = await prisma.shipment.findFirst({ orderBy: { folio: "desc" }, select: { folio: true } });
  const n = last ? parseInt(last.folio.split("-").pop() ?? "0", 10) || 0 : 0;
  return `MH-2026-${String(n + 1).padStart(4, "0")}`;
}

export async function POST(req: NextRequest) {
  const bloqueo = verificarPeticionERP(req);
  if (bloqueo) return bloqueo;

  const leido = await leerJSON(req);
  if (!leido.ok) return leido.res;

  const parsed = unidadSchema.safeParse(leido.body);
  if (!parsed.success) {
    return respuestaError(400, `Datos inválidos — ${mensajeValidacion(parsed.error.issues)}`);
  }
  const d = parsed.data;

  // La foto se re-codifica a WebP (máx. 1200 px, sin EXIF/GPS) antes de guardarla.
  let fotoNormalizada: string | null | undefined;
  if (d.fotoUrl !== undefined) {
    try {
      fotoNormalizada = await normalizarFoto(d.fotoUrl);
    } catch {
      return respuestaError(400, "Datos inválidos — fotoUrl no es una imagen válida");
    }
  }

  // Solo los campos que vienen en el body (undefined = no se toca).
  const campos = {
    equipoDescripcion: d.equipoDescripcion,
    categoria: d.categoria,
    tipoUnidad: d.tipoUnidad,
    serie: d.serie,
    cliente: d.cliente,
    vendedor: d.vendedor,
    origenCiudad: d.origenCiudad,
    aduana: d.aduana,
    destinoCiudad: d.destinoCiudad,
    proveedorCompra: d.proveedorCompra,
    proveedorCompraId: d.proveedorCompraId,
    provFleteUSA: d.provFleteUSA,
    provAgenteAduanal: d.provAgenteAduanal,
    fechaSalidaProgramada: d.fechaSalidaProgramada,
    millas: d.millas,
    fotoUrl: fotoNormalizada,
    // si el ERP manda otra foto, la miniatura guardada ya no sirve
    ...(fotoNormalizada !== undefined ? { fotoThumb: null } : {}),
  };

  try {
    const existente = await prisma.shipment.findUnique({ where: { erpId: d.erpId }, select: { id: true } });

    let shipment;
    let creado = false;
    if (existente) {
      shipment = await prisma.shipment.update({
        where: { erpId: d.erpId },
        data: { ...campos, ...(d.fechaInicio ? { fechaInicio: d.fechaInicio } : {}), origenERP: true },
      });
    } else {
      // Dos intentos por si dos altas simultáneas toman el mismo folio.
      for (let intento = 0; intento < 2 && !shipment; intento++) {
        try {
          shipment = await prisma.shipment.create({
            data: {
              ...campos,
              equipoDescripcion: d.equipoDescripcion ?? "Equipo sin descripción",
              cliente: d.cliente ?? "Sin cliente",
              serie: d.serie ?? "S/N",
              estatus: "Pendiente",
              folio: await nextFolio(),
              erpId: d.erpId,
              origenERP: true,
              erpUnidadSincronizada: true,
              fechaInicio: d.fechaInicio ?? new Date(),
            },
          });
          creado = true;
        } catch (err) {
          if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") || intento === 1) throw err;
          // si el choque fue por erpId (el ERP reenvió al mismo tiempo), es actualización
          const ahora = await prisma.shipment.findUnique({ where: { erpId: d.erpId } });
          if (ahora) shipment = await prisma.shipment.update({ where: { erpId: d.erpId }, data: campos });
        }
      }
      if (shipment && creado) {
        await prisma.statusEvent.create({
          data: {
            shipmentId: shipment.id,
            estatusNuevo: "Pendiente",
            usuario: "ERP",
            comentario: `Unidad dada de alta desde el ERP (Trato ${d.erpId})`,
          },
        });
      }
    }
    if (!shipment) throw new Error("No se pudo guardar la unidad");

    await registrarAuditoria({
      accion: creado ? "erp.entrante.unidad.crear" : "erp.entrante.unidad.actualizar",
      entidad: "Shipment",
      entidadId: shipment.folio,
      usuario: "ERP",
      httpStatus: creado ? 201 : 200,
      detalle: `Trato ${d.erpId} desde ${ipDe(req)}`,
    });

    revalidatePath("/");
    revalidatePath("/operaciones");
    revalidatePath(`/embarques/${shipment.id}`);

    return NextResponse.json(
      { ok: true, id: shipment.id, folio: shipment.folio, creado },
      { status: creado ? 201 : 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[api/erp/unidades]", err);
    await registrarAuditoria({
      accion: "erp.entrante.unidad.error",
      entidad: "Shipment",
      entidadId: d.erpId,
      usuario: "ERP",
      httpStatus: 500,
      detalle: err instanceof Error ? err.message : "Error desconocido",
    });
    return respuestaError(500, "Error interno al guardar la unidad en MH Logística.");
  }
}
