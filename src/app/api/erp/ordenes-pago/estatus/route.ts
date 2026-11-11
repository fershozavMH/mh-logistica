import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verificarPeticionERP, leerJSON, respuestaError, mensajeValidacion, ipDe } from "@/lib/erp-auth";
import { textoCorto, fechaISO, monto } from "@/lib/validacion";
import { registrarAuditoria } from "@/lib/audit";
import { ESTATUS_PAGO } from "@/lib/constants";

// POST /api/erp/ordenes-pago/estatus
// El ERP lo llama cuando Finanzas ejecuta el pago, o cuando revierte un pago
// que ya estaba hecho. Reemplaza el botón manual "Marcar como pagada".
// Requiere: Authorization: Bearer <MH_LOGISTICA_TOKEN>
//
// {
//   "folio": "OP-2026-0012",
//   "estatus": "Pagada" | "Pendiente",
//   "erpPago": "ACC-PAY-2026-00123",
//   "fechaPago": "2026-10-29",
//   "montoPagado": 89760.00,
//   "monedaPago": "MXN",
//   "tipoCambio": 17.6,
//   "referenciaBancaria": "SPEI 123456"
// }
//
//   - folio inexistente → 404
//   - si la orden ya tiene ese estatus → 200 sin cambiar nada
//   - "Pagada" → pasa a pagadas (y a reportes) y guarda los datos del pago
//   - "Pendiente" → Finanzas canceló un pago ya validado; la orden vuelve a
//     estar por pagar

const estatusSchema = z.object({
  folio: z.string({ message: "es obligatorio" }).trim().min(1, "es obligatorio").max(50),
  estatus: z.enum(["Pagada", "Pendiente"], { message: 'debe ser "Pagada" o "Pendiente"' }),
  erpPago: textoCorto(100),
  fechaPago: fechaISO.optional(),
  montoPagado: monto.optional(),
  monedaPago: z.enum(["MXN", "USD"], { message: 'debe ser "MXN" o "USD"' }).optional(),
  tipoCambio: z.number().finite().positive("debe ser mayor a 0").optional(),
  referenciaBancaria: textoCorto(200),
});

export async function POST(req: NextRequest) {
  const bloqueo = verificarPeticionERP(req);
  if (bloqueo) return bloqueo;

  const leido = await leerJSON(req);
  if (!leido.ok) return leido.res;

  const parsed = estatusSchema.safeParse(leido.body);
  if (!parsed.success) {
    return respuestaError(400, `Datos inválidos — ${mensajeValidacion(parsed.error.issues)}`);
  }
  const d = parsed.data;
  const destino = d.estatus === "Pagada" ? ESTATUS_PAGO.PAGADO : ESTATUS_PAGO.PENDIENTE;

  try {
    const orden = await prisma.paymentOrder.findUnique({ where: { folio: d.folio } });
    if (!orden || orden.eliminadaAt) {
      return respuestaError(404, `No existe la orden ${d.folio} en MH Logística.`);
    }

    // un pago marcado a mano en Logística se reemplaza con lo que confirma el ERP
    if (orden.estatusPago === destino && orden.erpPago !== "MANUAL") {
      return NextResponse.json(
        { ok: true, folio: orden.folio, estatus: d.estatus, sinCambios: true },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (orden.estatusPago === ESTATUS_PAGO.CANCELADA) {
      return respuestaError(409, `La orden ${d.folio} está cancelada en MH Logística; no se puede marcar como ${d.estatus.toLowerCase()}.`);
    }

    const data =
      destino === ESTATUS_PAGO.PAGADO
        ? {
            estatusPago: ESTATUS_PAGO.PAGADO,
            erpPago: d.erpPago ?? null,
            fechaPago: d.fechaPago ?? new Date(),
            montoPagado: d.montoPagado ?? null,
            monedaPago: d.monedaPago ?? null,
            tipoCambioPago: d.tipoCambio ?? null,
            referenciaBancaria: d.referenciaBancaria ?? null,
          }
        : {
            // pago revertido por Finanzas: vuelve a estar por pagar
            estatusPago: ESTATUS_PAGO.PENDIENTE,
            erpPago: null,
            fechaPago: null,
            montoPagado: null,
            monedaPago: null,
            tipoCambioPago: null,
            referenciaBancaria: null,
          };

    // Solo cambia si sigue en el estatus que se leyó (evita pisar un cambio
    // simultáneo, ej. una cancelación desde MH Logística).
    const r = await prisma.paymentOrder.updateMany({
      where: { id: orden.id, estatusPago: orden.estatusPago, eliminadaAt: null },
      data,
    });
    if (r.count === 0) {
      return respuestaError(409, `La orden ${d.folio} cambió mientras se procesaba; reintenta.`);
    }

    await registrarAuditoria({
      accion: destino === ESTATUS_PAGO.PAGADO ? "orden.pagada_erp" : "orden.pago_revertido_erp",
      entidad: "PaymentOrder",
      entidadId: orden.folio,
      usuario: "ERP (Finanzas)",
      httpStatus: 200,
      detalle: `${orden.estatusPago} → ${destino}${d.erpPago ? ` · ${d.erpPago}` : ""}${d.referenciaBancaria ? ` · ref ${d.referenciaBancaria}` : ""} desde ${ipDe(req)}`,
    });

    revalidatePath("/");
    revalidatePath("/costos");
    revalidatePath("/reportes");
    revalidatePath(`/orden-pago/${orden.id}`);
    if (orden.shipmentId) revalidatePath(`/embarques/${orden.shipmentId}`);

    return NextResponse.json(
      { ok: true, folio: orden.folio, estatus: d.estatus },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    console.error("[api/erp/ordenes-pago/estatus]", err);
    return respuestaError(500, "Error interno al actualizar la orden en MH Logística.");
  }
}
