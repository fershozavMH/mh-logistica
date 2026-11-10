import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { llamarERP, ErpError } from "@/lib/erp-client";
import { registrarAuditoria } from "@/lib/audit";
import { ESTATUS_PAGO } from "@/lib/constants";

// Integración con el ERP interno (Frappe). Tres métodos del lado del ERP:
//   mh.api.log_orden_pago   generar / reenviar / cancelar una orden de pago
//   mh.api.log_unidad       alta o cambio de una unidad que NO vino del ERP
//   mh.api.log_proveedores  catálogo de proveedores y cuentas bancarias
// Los dos endpoints que el ERP llama aquí están en src/app/api/erp/.

function mensajeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Error desconocido";
}

// ---------------------------------------------------------------------------
// Unidades (log_unidad)
// ---------------------------------------------------------------------------

interface RespuestaLogUnidad {
  ok?: boolean;
  trato?: string;
  creado?: boolean;
}

// Manda la unidad completa al ERP y guarda el "trato" que regresa como su
// erpId. Volver a llamarlo actualiza el Trato, no crea otro. Las unidades que
// llegaron del ERP (origenERP) no se mandan de regreso. Nunca truena: el
// resultado queda en erpUnidadSincronizada / erpUnidadError.
export async function sincronizarUnidadERP(shipmentId: string): Promise<{ ok: boolean; error?: string }> {
  const s = await prisma.shipment.findUnique({ where: { id: shipmentId }, omit: { fotoUrl: false } });
  if (!s) return { ok: false, error: "Unidad no encontrada" };
  if (s.origenERP) return { ok: true };

  const unidad = {
    id: s.id,
    folio: s.folio,
    ...(s.erpId ? { erpId: s.erpId } : {}),
    tipoVenta: s.tipoVenta,
    equipoDescripcion: s.equipoDescripcion,
    categoria: s.categoria,
    tipoUnidad: s.tipoUnidad,
    serie: s.serie,
    cliente: s.cliente,
    vendedor: s.vendedor,
    estatus: s.estatus,
    origenCiudad: s.origenCiudad,
    aduana: s.aduana,
    destinoCiudad: s.destinoCiudad,
    proveedorCompra: s.proveedorCompra,
    proveedorCompraId: s.proveedorCompraId,
    provFleteUSA: s.provFleteUSA,
    provAgenteAduanal: s.provAgenteAduanal,
    millas: s.millas,
    // montos en USD, igual que en las órdenes de pago
    costos: {
      fleteUSA: s.costoFleteUSA,
      importacion: s.costoImportacion,
      bondCanada: s.costoBondCanada,
      maniobras: s.costoManiobras,
      fleteMx: s.costoFleteMx,
      permiso: s.costoPermiso,
      seguro: s.costoSeguro,
      placas: s.costoPlacas,
      repuveTitulo: s.costoRepuveTitulo,
    },
    precios: {
      fleteUSA: s.precioFleteUSA,
      importacion: s.precioImportacion,
      fleteMx: s.precioFleteMx,
      permiso: s.precioPermiso,
      seguro: s.precioSeguro,
      placas: s.precioPlacas,
    },
    fechaInicio: s.fechaInicio,
    fechaCompra: s.fechaCompra,
    fechaSalidaUSA: s.fechaSalidaUSA,
    fechaCruce: s.fechaCruce,
    fechaSalidaProgramada: s.fechaSalidaProgramada,
    fechaEntrega: s.fechaEntrega,
    fotoUrl: s.fotoUrl,
  };

  try {
    const r = await llamarERP<RespuestaLogUnidad>({
      metodo: "POST",
      endpoint: "mh.api.log_unidad",
      body: unidad,
      referencia: s.folio,
    });
    if (!r || r.ok === false || !r.trato) {
      throw new ErpError("El ERP no regresó el trato de la unidad", null, false);
    }
    await prisma.shipment.update({
      where: { id: s.id },
      data: {
        erpId: r.trato,
        erpUnidadSincronizada: true,
        erpUnidadError: null,
        erpUnidadSincronizadaAt: new Date(),
      },
    });
    return { ok: true };
  } catch (err) {
    const error = mensajeError(err).slice(0, 500);
    await prisma.shipment
      .update({ where: { id: s.id }, data: { erpUnidadSincronizada: false, erpUnidadError: error } })
      .catch(() => {});
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------------------
// Órdenes de pago (log_orden_pago)
// ---------------------------------------------------------------------------

interface RespuestaLogOrden {
  ok?: boolean;
  orden?: string;
  payment_entry?: string | null;
  aviso?: string | null;
}

async function construirPayloadOrden(orderId: string, estatusPago?: string) {
  let order = await prisma.paymentOrder.findUnique({
    where: { id: orderId },
    include: { shipment: true, gastosGenerales: { orderBy: { createdAt: "asc" } } },
  });
  if (!order) return null;

  // equipo.erpId es obligatorio para el ERP: si la unidad se capturó aquí y
  // todavía no tiene trato, primero se manda con log_unidad.
  if (order.shipment && !order.shipment.erpId && !order.shipment.origenERP) {
    await sincronizarUnidadERP(order.shipment.id);
    order = await prisma.paymentOrder.findUnique({
      where: { id: orderId },
      include: { shipment: true, gastosGenerales: { orderBy: { createdAt: "asc" } } },
    });
    if (!order) return null;
  }

  const s = order.shipment;
  const payload = {
    orden: {
      folio: order.folio,
      fechaGenerada: order.fechaGenerada,
      generadaPor: order.generadaPor,
      concepto: order.concepto,
      // montos siempre en USD; tipoCambio es USD → MXN
      moneda: "USD",
      total: order.total,
      tipoCambio: order.tipoCambio,
      estatusPago: estatusPago ?? order.estatusPago,
      notas: order.notas,
      proveedorId: order.proveedorId,
      proveedorNombre: order.proveedorNombre,
      costos: {
        fleteUSA: order.costoFleteUSA,
        importacion: order.costoImportacion,
        bondCanada: order.costoBondCanada,
        maniobras: order.costoManiobras,
        fleteMx: order.costoFleteMx,
        permiso: order.costoPermiso,
        seguro: order.costoSeguro,
        placas: order.costoPlacas,
        repuveTitulo: order.costoRepuveTitulo,
        // ya incluido en fleteUSA y en total — no se suma otra vez
        gastoAdicionalFlete: order.costoGastoAdicionalFlete,
      },
      detalleFleteUSA: order.detalleFleteUSA,
      gastosGenerales: order.gastosGenerales.map((g) => ({ descripcion: g.descripcion, monto: g.monto })),
      datosBancarios: {
        monedaCuenta: order.monedaCuenta,
        banco: order.banco,
        direccionBanco: order.direccionBanco,
        numeroCuenta: order.numeroCuenta,
        clabe: order.clabe,
        titular: order.titular,
        direccionTitular: order.direccionTitular,
        swift: order.swift,
        routing: order.routing,
        sucursal: order.sucursal,
      },
    },
    equipo: s
      ? {
          id: s.id,
          erpId: s.erpId,
          folio: s.folio,
          descripcion: s.equipoDescripcion,
          categoria: s.categoria,
          tipoUnidad: s.tipoUnidad,
          serie: s.serie,
          cliente: s.cliente,
          vendedor: s.vendedor,
          estatus: s.estatus,
          origenCiudad: s.origenCiudad,
          aduana: s.aduana,
          destinoCiudad: s.destinoCiudad,
          proveedorCompra: s.proveedorCompra,
          proveedorCompraId: s.proveedorCompraId,
          provFleteUSA: s.provFleteUSA,
          provAgenteAduanal: s.provAgenteAduanal,
          millas: s.millas,
          fechaInicio: s.fechaInicio,
          fechaCompra: s.fechaCompra,
          fechaSalidaUSA: s.fechaSalidaUSA,
          fechaCruce: s.fechaCruce,
          fechaSalidaProgramada: s.fechaSalidaProgramada,
          fechaEntrega: s.fechaEntrega,
        }
      : null,
  };
  return { order, payload };
}

// Manda (o reenvía) la orden al ERP. Si falla, la orden se queda guardada
// aquí como "no sincronizada" (regla D12: nunca se da por enviada una orden
// que el ERP no confirmó) y se puede reintentar.
export async function enviarOrdenAlERP(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const datos = await construirPayloadOrden(orderId);
  if (!datos) return { ok: false, error: "Orden no encontrada" };

  try {
    const r = await llamarERP<RespuestaLogOrden>({
      metodo: "POST",
      endpoint: "mh.api.log_orden_pago",
      body: datos.payload,
      referencia: datos.order.folio,
    });
    if (!r || r.ok === false) throw new ErpError("El ERP no confirmó la orden", null, false);

    await prisma.paymentOrder.update({
      where: { id: orderId },
      data: {
        erpEnviado: true,
        erpError: null,
        erpEnviadoAt: new Date(),
        erpPaymentEntry: r.payment_entry ?? null,
        erpAviso: r.aviso ?? null,
      },
    });
    return { ok: true };
  } catch (err) {
    const error = mensajeError(err).slice(0, 500);
    await prisma.paymentOrder
      .update({ where: { id: orderId }, data: { erpEnviado: false, erpError: error } })
      .catch(() => {});
    return { ok: false, error };
  }
}

// Cancelar = reenviar la orden con estatusPago "Cancelada" (mismo folio). El
// ERP elimina el pago en borrador; si Finanzas ya la pagó responde 417 ("ya
// se pagó en el ERP; no se puede cancelar") y aquí la orden no cambia.
export async function cancelarOrdenEnERP(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const datos = await construirPayloadOrden(orderId, ESTATUS_PAGO.CANCELADA);
  if (!datos) return { ok: false, error: "Orden no encontrada" };
  try {
    const r = await llamarERP<RespuestaLogOrden>({
      metodo: "POST",
      endpoint: "mh.api.log_orden_pago",
      body: datos.payload,
      referencia: datos.order.folio,
    });
    if (!r || r.ok === false) throw new ErpError("El ERP no confirmó la cancelación", null, false);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: mensajeError(err).slice(0, 500) };
  }
}

// Reintento automático de órdenes que el ERP no confirmó (se dispara desde
// /costos, a lo más cada 5 minutos y de pocas en pocas).
export async function reintentarOrdenesNoSincronizadas(): Promise<void> {
  const CLAVE = "reintento-ordenes";
  const estado = await prisma.integracionEstado.findUnique({ where: { clave: CLAVE } }).catch(() => null);
  if (estado && Date.now() - estado.ultimaVez.getTime() < 5 * 60 * 1000) return;
  await prisma.integracionEstado
    .upsert({ where: { clave: CLAVE }, create: { clave: CLAVE, ultimaVez: new Date() }, update: { ultimaVez: new Date() } })
    .catch(() => {});

  const pendientes = await prisma.paymentOrder.findMany({
    where: {
      erpEnviado: false,
      estatusPago: ESTATUS_PAGO.PENDIENTE,
      eliminadaAt: null,
      fechaGenerada: { lt: new Date(Date.now() - 60 * 1000) },
    },
    orderBy: { fechaGenerada: "asc" },
    take: 5,
    select: { id: true },
  });
  for (const o of pendientes) {
    await enviarOrdenAlERP(o.id);
  }
}

// ---------------------------------------------------------------------------
// Proveedores (log_proveedores)
// ---------------------------------------------------------------------------

const textoOpcional = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim()));

const cuentaSchema = z.object({
  banco: textoOpcional,
  nombreCuenta: textoOpcional,
  numeroCuenta: textoOpcional,
  clabeIban: textoOpcional,
  swift: textoOpcional,
  routing: textoOpcional,
  sucursal: textoOpcional,
  moneda: textoOpcional,
  predeterminada: z.union([z.boolean(), z.number()]).optional().transform((v) => v === true || v === 1),
});

// El ERP identifica al proveedor con `proveedorId` (se acepta `id` por si cambia).
const proveedorSchema = z
  .object({
    proveedorId: z.union([z.string(), z.number()]).optional(),
    id: z.union([z.string(), z.number()]).optional(),
    nombre: z.string().trim().min(1),
    activo: z.union([z.boolean(), z.number()]).optional().transform((v) => v === undefined || v === true || v === 1),
    cuentas: z.array(cuentaSchema).nullish().transform((v) => v ?? []),
  })
  .transform((p, ctx) => {
    const id = String(p.proveedorId ?? p.id ?? "").trim();
    if (!id) {
      ctx.addIssue({ code: "custom", message: "falta proveedorId" });
      return z.NEVER;
    }
    return { id, nombre: p.nombre, activo: p.activo, cuentas: p.cuentas };
  });

const CLAVE_PROVEEDORES = "proveedores";

function formatoFrappe(d: Date): string {
  // "2026-10-29 00:00:00" — se manda en UTC con un día de traslape (ver abajo)
  return d.toISOString().slice(0, 19).replace("T", " ");
}

// Trae el catálogo de proveedores del ERP. Con `desde` el ERP solo manda lo
// que cambió después de esa fecha; se pide con 24 h de traslape para no
// perder cambios por diferencias de zona horaria (el upsert es idempotente).
export async function sincronizarProveedores(opciones: { forzar?: boolean; rapido?: boolean } = {}): Promise<{
  ok: boolean;
  actualizados?: number;
  error?: string;
  omitido?: boolean;
}> {
  const estado = await prisma.integracionEstado.findUnique({ where: { clave: CLAVE_PROVEEDORES } });
  if (!opciones.forzar && estado && !estado.ultimoError && Date.now() - estado.ultimaVez.getTime() < 15 * 60 * 1000) {
    return { ok: true, omitido: true };
  }

  const inicio = new Date();
  const hayCatalogo = (await prisma.proveedorERP.count()) > 0;
  const desde = estado && hayCatalogo && !estado.ultimoError ? formatoFrappe(new Date(estado.ultimaVez.getTime() - 24 * 3600 * 1000)) : undefined;

  try {
    const respuesta = await llamarERP<unknown>({
      metodo: "GET",
      endpoint: "mh.api.log_proveedores",
      query: { desde },
      referencia: desde ? `desde ${desde}` : "completo",
      // al abrir un formulario no se hace esperar al usuario con reintentos
      ...(opciones.rapido ? { reintentos: 0, timeoutMs: 6000 } : {}),
    });
    const lista = z.array(proveedorSchema).parse(respuesta ?? []);

    for (const p of lista) {
      await prisma.$transaction([
        prisma.proveedorERP.upsert({
          where: { id: p.id },
          create: { id: p.id, nombre: p.nombre, activo: p.activo },
          update: { nombre: p.nombre, activo: p.activo },
        }),
        prisma.cuentaBancariaERP.deleteMany({ where: { proveedorId: p.id } }),
        prisma.cuentaBancariaERP.createMany({
          data: p.cuentas.map((c) => ({ ...c, proveedorId: p.id })),
        }),
      ]);
    }

    await prisma.integracionEstado.upsert({
      where: { clave: CLAVE_PROVEEDORES },
      create: { clave: CLAVE_PROVEEDORES, ultimaVez: inicio },
      update: { ultimaVez: inicio, ultimoError: null },
    });
    return { ok: true, actualizados: lista.length };
  } catch (err) {
    // Del error de formato solo se guarda el campo que falló, nunca su valor
    // (los datos pueden traer cuentas bancarias).
    const primero = err instanceof z.ZodError ? err.issues[0] : undefined;
    const error = (
      primero
        ? `El catálogo del ERP llegó con un formato inesperado (${primero.path.join(".") || "raíz"}: ${primero.message})`
        : mensajeError(err)
    ).slice(0, 500);
    await prisma.integracionEstado
      .upsert({
        where: { clave: CLAVE_PROVEEDORES },
        create: { clave: CLAVE_PROVEEDORES, ultimaVez: estado?.ultimaVez ?? new Date(0), ultimoError: error },
        update: { ultimoError: error },
      })
      .catch(() => {});
    await registrarAuditoria({ accion: "erp.proveedores.error", entidad: "ERP", detalle: error });
    return { ok: false, error };
  }
}

export async function getEstadoProveedores() {
  return prisma.integracionEstado.findUnique({ where: { clave: CLAVE_PROVEEDORES } });
}

export interface OpcionProveedor {
  id: string;
  nombre: string;
  cuentas: {
    id: string;
    etiqueta: string;
    moneda: string | null;
    predeterminada: boolean;
  }[];
}

function ultimos4(v: string | null) {
  if (!v) return null;
  const l = v.replace(/\s+/g, "");
  return l.length > 4 ? `•••• ${l.slice(-4)}` : l;
}

// Opciones para el formulario de orden: solo proveedores activos y los datos
// bancarios enmascarados (los completos solo se copian del lado del servidor
// al generar la orden — nunca viajan desde el navegador).
export async function getOpcionesProveedores(): Promise<OpcionProveedor[]> {
  const proveedores = await prisma.proveedorERP.findMany({
    where: { activo: true },
    include: { cuentas: { orderBy: [{ predeterminada: "desc" }, { banco: "asc" }] } },
    orderBy: { nombre: "asc" },
  });
  return proveedores.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    cuentas: p.cuentas.map((c) => ({
      id: c.id,
      etiqueta: [c.banco, c.nombreCuenta, ultimos4(c.clabeIban) ?? ultimos4(c.numeroCuenta)].filter(Boolean).join(" — "),
      moneda: c.moneda,
      predeterminada: c.predeterminada,
    })),
  }));
}

// ---------------------------------------------------------------------------
// Estimaciones (log_estimacion)
// ---------------------------------------------------------------------------

interface RespuestaLogEstimacion {
  ok?: boolean;
}

// Manda al ERP los estimados de Logística de un equipo (montos en USD).
// Nunca truena: el resultado queda en erpEnviado / erpError, y se puede
// reenviar desde "Por cotizar".
export async function enviarEstimacionAlERP(solicitudId: string): Promise<{ ok: boolean; error?: string }> {
  const s = await prisma.solicitudEstimacion.findUnique({ where: { id: solicitudId } });
  if (!s) return { ok: false, error: "Solicitud no encontrada" };
  if (s.estimadoAt === null) return { ok: false, error: "Todavía no tiene estimado" };

  try {
    const r = await llamarERP<RespuestaLogEstimacion>({
      metodo: "POST",
      endpoint: "mh.api.log_estimacion",
      body: {
        equipoId: s.erpEquipoId,
        moneda: "USD",
        estimados: { fleteUSA: s.estFleteUSA ?? 0, importacion: s.estImportacion ?? 0 },
        estimadoPor: s.estimadoPor,
        fecha: s.estimadoAt,
      },
      referencia: s.erpEquipoId,
    });
    if (!r || r.ok === false) throw new ErpError("El ERP no confirmó el estimado", null, false);
    await prisma.solicitudEstimacion.update({
      where: { id: solicitudId },
      data: { erpEnviado: true, erpError: null, erpEnviadoAt: new Date() },
    });
    return { ok: true };
  } catch (err) {
    const error = mensajeError(err).slice(0, 500);
    await prisma.solicitudEstimacion
      .update({ where: { id: solicitudId }, data: { erpEnviado: false, erpError: error } })
      .catch(() => {});
    return { ok: false, error };
  }
}
