"use server";

import { revalidatePath } from "next/cache";
import { normalizarFoto } from "@/lib/imagenes";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { esSoloLectura, getSesion } from "@/lib/auth-server";
import { enviarOrdenAlERP, cancelarOrdenEnERP, sincronizarUnidadERP, sincronizarProveedores, enviarEstimacionAlERP } from "@/lib/erp";
import { registrarAuditoria } from "@/lib/audit";
import { redondear2 } from "@/lib/validacion";
import { ESTATUS_PAGO, FLETE_USA_SLOTS, gastoFleteUSAPerteneceASlot } from "@/lib/constants";

// Barrera real de seguridad para el acceso de "solo lectura" (Dirección): el
// botón ya se oculta en la UI, pero esto bloquea igual si alguien manda la
// acción directo (devtools, etc.) — toda acción que modifique datos debe
// llamar esto primero.
async function requireFullAccess() {
  if (await esSoloLectura()) {
    throw new Error("Tu acceso es de solo lectura — no puedes hacer cambios.");
  }
}

// Para la bitácora y el historial: el nombre del usuario con sesión (ya no
// se toma lo que mande el formulario, que se podía elegir a mano).
async function nombreSesion(): Promise<string> {
  return (await getSesion())?.nombre ?? "Sistema";
}
async function usuarioBitacora() {
  const s = await getSesion();
  return s ? `${s.nombre} <${s.email}>` : "sin sesión";
}

// Las unidades capturadas aquí (no las que mandó el ERP) se mandan al ERP con
// log_unidad cada vez que se dan de alta o cambian. Corre después de
// responder, para no hacer esperar a quien está capturando.
function sincronizarUnidadDespues(shipmentId: string) {
  after(async () => {
    await sincronizarUnidadERP(shipmentId);
  });
}

// Montos que se capturan a mano en la orden: nunca negativos, 2 decimales.
function validarMontos(montos: Record<string, number>) {
  for (const [campo, valor] of Object.entries(montos)) {
    if (!Number.isFinite(valor) || valor < 0) {
      throw new Error(`El monto de ${campo} no puede ser negativo.`);
    }
    montos[campo] = redondear2(valor);
  }
}

// Proveedor y cuenta bancaria de la orden: salen del catálogo del ERP
// (regla D5 — no se captura CLABE a mano). El formulario solo manda los ids;
// los datos bancarios completos se copian aquí, del lado del servidor.
async function datosBancariosDesdeCatalogo(formData: FormData) {
  const proveedorId = str(formData, "proveedorId");
  const cuentaId = str(formData, "cuentaId");
  if (!proveedorId || !cuentaId) {
    throw new Error("Elige el proveedor y la cuenta bancaria del catálogo del ERP.");
  }
  const proveedor = await prisma.proveedorERP.findUnique({ where: { id: proveedorId } });
  if (!proveedor) throw new Error("Ese proveedor no está en el catálogo del ERP.");
  if (!proveedor.activo) {
    throw new Error(`El proveedor ${proveedor.nombre} está inactivo en el ERP; no se le pueden generar órdenes nuevas.`);
  }
  const cuenta = await prisma.cuentaBancariaERP.findFirst({ where: { id: cuentaId, proveedorId } });
  if (!cuenta) throw new Error("La cuenta elegida no pertenece a ese proveedor.");

  const moneda = str(formData, "monedaCuenta");
  return {
    proveedorId: proveedor.id,
    proveedorNombre: proveedor.nombre,
    monedaCuenta: moneda === "USD" || moneda === "MXN" ? moneda : cuenta.moneda,
    banco: cuenta.banco,
    numeroCuenta: cuenta.numeroCuenta,
    clabe: cuenta.clabeIban,
    titular: cuenta.nombreCuenta ?? proveedor.nombre,
    swift: cuenta.swift,
    routing: cuenta.routing,
    sucursal: cuenta.sucursal,
  };
}

export async function actualizarCatalogoProveedores(): Promise<void> {
  await requireFullAccess();
  await sincronizarProveedores({ forzar: true });
  revalidatePath("/costos");
  revalidatePath("/embarques/[id]", "page");
}

// Se basa en el folio más alto que exista (no en un conteo), para que no se
// repita un folio si antes se borró alguna unidad u orden a la mitad.
async function nextFolio() {
  const last = await prisma.shipment.findFirst({
    orderBy: { folio: "desc" },
    select: { folio: true },
  });
  const n = last ? parseInt(last.folio.split("-").pop() ?? "0", 10) || 0 : 0;
  return `MH-2026-${String(n + 1).padStart(4, "0")}`;
}

async function nextCotizacionFolio() {
  const last = await prisma.cotizacion.findFirst({
    orderBy: { folio: "desc" },
    select: { folio: true },
  });
  const n = last ? parseInt(last.folio.split("-").pop() ?? "0", 10) || 0 : 0;
  return `COT-2026-${String(n + 1).padStart(4, "0")}`;
}

function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : undefined;
}

function num(fd: FormData, key: string): number {
  const v = fd.get(key);
  if (typeof v !== "string" || v.trim() === "") return 0;
  // admite que Jaime escriba "$1,234.56" o similar, no solo "1234.56"
  const limpio = v.replace(/[^0-9.-]/g, "");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

function dateOrNull(fd: FormData, key: string): Date | null {
  const v = str(fd, key);
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Embarques
// ---------------------------------------------------------------------------

export async function createShipment(formData: FormData) {
  await requireFullAccess();
  const folio = await nextFolio();

  const shipment = await prisma.shipment.create({
    data: {
      folio,
      equipoDescripcion: str(formData, "equipoDescripcion") ?? "Equipo sin descripción",
      categoria: str(formData, "categoria"),
      tipoUnidad: str(formData, "tipoUnidad"),
      cliente: str(formData, "cliente") ?? "Sin cliente",
      serie: str(formData, "serie") ?? "S/N",
      vendedor: str(formData, "vendedor"),
      estatus: str(formData, "estatus") ?? "Pendiente",
      origenCiudad: str(formData, "origenCiudad"),
      aduana: str(formData, "aduana"),
      destinoCiudad: str(formData, "destinoCiudad"),
      proveedorCompra: str(formData, "proveedorCompra"),
      provFleteUSA: str(formData, "provFleteUSA"),
      provAgenteAduanal: str(formData, "provAgenteAduanal"),
      fechaInicio: dateOrNull(formData, "fechaInicio") ?? new Date(),
      fechaSalidaProgramada: dateOrNull(formData, "fechaSalidaProgramada"),
      fechaCompra: dateOrNull(formData, "fechaCompra"),
      millas: num(formData, "millas"),
    },
  });

  await prisma.statusEvent.create({
    data: {
      shipmentId: shipment.id,
      estatusNuevo: shipment.estatus,
      usuario: await nombreSesion(),
      comentario: "Unidad dada de alta",
    },
  });
  sincronizarUnidadDespues(shipment.id);

  revalidatePath("/");
  revalidatePath("/operaciones");
  redirect(`/embarques/${shipment.id}`);
}

// Venta de un servicio logístico suelto (cliente externo que no compra
// equipo con MH, solo contrata el flete/importación/etc.). Se crea igual
// como un Shipment para que automáticamente aparezca en Operaciones con
// su propio estatus y seguimiento, pero con tipoVenta = "Servicio Logístico"
// y precios de venta por concepto (para calcular utilidad).
export async function crearVentaServicio(formData: FormData) {
  await requireFullAccess();
  const folio = await nextFolio();

  const shipment = await prisma.shipment.create({
    data: {
      folio,
      tipoVenta: "Servicio Logístico",
      equipoDescripcion: str(formData, "equipoDescripcion") ?? "Servicio logístico",
      cliente: str(formData, "cliente") ?? "Sin cliente",
      serie: str(formData, "serie") ?? "S/N",
      vendedor: str(formData, "vendedor"),
      estatus: str(formData, "estatus") ?? "Pendiente",
      origenCiudad: str(formData, "origenCiudad"),
      aduana: str(formData, "aduana"),
      destinoCiudad: str(formData, "destinoCiudad"),
      fechaInicio: dateOrNull(formData, "fechaInicio") ?? new Date(),
      costoFleteUSA: num(formData, "costoFleteUSA"),
      costoImportacion: num(formData, "costoImportacion"),
      costoFleteMx: num(formData, "costoFleteMx"),
      costoPermiso: num(formData, "costoPermiso"),
      costoSeguro: num(formData, "costoSeguro"),
      costoPlacas: num(formData, "costoPlacas"),
      precioFleteUSA: num(formData, "precioFleteUSA"),
      precioImportacion: num(formData, "precioImportacion"),
      precioFleteMx: num(formData, "precioFleteMx"),
      precioPermiso: num(formData, "precioPermiso"),
      precioSeguro: num(formData, "precioSeguro"),
      precioPlacas: num(formData, "precioPlacas"),
    },
  });

  await prisma.statusEvent.create({
    data: {
      shipmentId: shipment.id,
      estatusNuevo: shipment.estatus,
      usuario: await nombreSesion(),
      comentario: "Venta de servicio logístico dada de alta",
    },
  });
  sincronizarUnidadDespues(shipment.id);

  revalidatePath("/");
  revalidatePath("/operaciones");
  revalidatePath("/ventas");
  redirect(`/embarques/${shipment.id}`);
}

export async function updateShipmentEstatus(
  shipmentId: string,
  nuevoEstatus: string,
  usuario: string,
  comentario?: string,
  fecha?: Date
) {
  await requireFullAccess();
  const current = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!current) throw new Error("Embarque no encontrado");
  const fechaMovimiento = fecha ?? new Date();

  await prisma.$transaction([
    prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        estatus: nuevoEstatus,
        fechaEntrega: nuevoEstatus === "Entregado" ? fechaMovimiento : current.fechaEntrega,
      },
    }),
    prisma.statusEvent.create({
      data: {
        shipmentId,
        estatusAnterior: current.estatus,
        estatusNuevo: nuevoEstatus,
        usuario,
        comentario,
        fecha: fechaMovimiento,
      },
    }),
  ]);

  sincronizarUnidadDespues(shipmentId);

  revalidatePath("/");
  revalidatePath("/operaciones");
  revalidatePath(`/embarques/${shipmentId}`);
  revalidatePath("/reportes");
}

export async function updateShipmentEstatusForm(shipmentId: string, formData: FormData) {
  const nuevoEstatus = str(formData, "estatus");
  const usuario = await nombreSesion();
  const comentario = str(formData, "comentario");
  const fecha = dateOrNull(formData, "fecha") ?? undefined;
  if (!nuevoEstatus) return;
  await updateShipmentEstatus(shipmentId, nuevoEstatus, usuario, comentario, fecha);
}

// Para capturar a mano, con fecha real pasada, una etapa por la que ya cruzó
// la unidad pero que no se registró en su momento (ej. una unidad que llega
// al sistema ya avanzada, o a la que se le saltaron pasos al cambiar su
// estatus) — así "Tiempo promedio por etapa" en Reportes/Analítica sale con
// datos más completos. A propósito NO toca el estatus actual de la unidad
// ni su fechaEntrega: es solo historial, no un cambio de estatus real.
export async function agregarStatusEventManual(shipmentId: string, formData: FormData) {
  await requireFullAccess();
  const estatusNuevo = str(formData, "estatus");
  const fecha = dateOrNull(formData, "fecha");
  if (!estatusNuevo || !fecha) throw new Error("Falta el estatus o la fecha.");

  await prisma.statusEvent.create({
    data: {
      shipmentId,
      estatusNuevo,
      fecha,
      usuario: await nombreSesion(),
      comentario: str(formData, "comentario"),
    },
  });

  revalidatePath(`/embarques/${shipmentId}`);
  revalidatePath("/reportes");
  revalidatePath("/analitica");
}

export async function editarStatusEvent(eventId: string, formData: FormData) {
  await requireFullAccess();
  const estatusNuevo = str(formData, "estatus");
  const fecha = dateOrNull(formData, "fecha");
  if (!estatusNuevo || !fecha) throw new Error("Falta el estatus o la fecha.");

  const evento = await prisma.statusEvent.update({
    where: { id: eventId },
    data: { estatusNuevo, fecha, comentario: str(formData, "comentario") },
  });

  revalidatePath(`/embarques/${evento.shipmentId}`);
  revalidatePath("/reportes");
  revalidatePath("/analitica");
}

export async function eliminarStatusEvent(eventId: string) {
  await requireFullAccess();
  const evento = await prisma.statusEvent.delete({ where: { id: eventId } });
  revalidatePath(`/embarques/${evento.shipmentId}`);
  revalidatePath("/reportes");
  revalidatePath("/analitica");
}

export async function updateShipmentInfo(shipmentId: string, formData: FormData) {
  await requireFullAccess();
  await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      equipoDescripcion: str(formData, "equipoDescripcion"),
      categoria: str(formData, "categoria"),
      tipoUnidad: str(formData, "tipoUnidad"),
      cliente: str(formData, "cliente"),
      serie: str(formData, "serie"),
      vendedor: str(formData, "vendedor"),
      origenCiudad: str(formData, "origenCiudad"),
      aduana: str(formData, "aduana"),
      destinoCiudad: str(formData, "destinoCiudad"),
      proveedorCompra: str(formData, "proveedorCompra"),
      provFleteUSA: str(formData, "provFleteUSA"),
      provAgenteAduanal: str(formData, "provAgenteAduanal"),
      fechaInicio: dateOrNull(formData, "fechaInicio"),
      fechaSalidaProgramada: dateOrNull(formData, "fechaSalidaProgramada"),
      fechaCompra: dateOrNull(formData, "fechaCompra"),
      fechaSalidaUSA: dateOrNull(formData, "fechaSalidaUSA"),
      fechaCruce: dateOrNull(formData, "fechaCruce"),
      incidencias: str(formData, "incidencias"),
      millas: num(formData, "millas"),
      // erpId ya no se edita a mano: lo pone el ERP (unidades que manda) o
      // lo regresa log_unidad como "trato" (unidades capturadas aquí).
    },
  });
  sincronizarUnidadDespues(shipmentId);

  revalidatePath(`/embarques/${shipmentId}`);
  revalidatePath("/");
  revalidatePath("/operaciones");
  revalidatePath("/mapa");
}

export async function guardarFotoEquipo(shipmentId: string, dataUrl: string): Promise<void> {
  await requireFullAccess();
  if (!dataUrl.startsWith("data:image/")) throw new Error("Imagen inválida");
  const fotoUrl = await normalizarFoto(dataUrl);
  await prisma.shipment.update({
    where: { id: shipmentId },
    data: { fotoUrl, fotoThumb: null },
  });
  sincronizarUnidadDespues(shipmentId);
  revalidatePath(`/embarques/${shipmentId}`);
  revalidatePath("/operaciones");
  revalidatePath("/");
  revalidatePath("/costos");
}

export async function quitarFotoEquipo(shipmentId: string): Promise<void> {
  await requireFullAccess();
  await prisma.shipment.update({
    where: { id: shipmentId },
    data: { fotoUrl: null, fotoThumb: null },
  });
  revalidatePath(`/embarques/${shipmentId}`);
  revalidatePath("/operaciones");
  revalidatePath("/");
  revalidatePath("/costos");
}

// Documentos adjuntos a la unidad (facturas, pedimentos, BL, etc.) — se
// guardan como data URL igual que la foto del equipo, así quedan disponibles
// para consultarlos/descargarlos después sin depender de un servicio externo.
export async function guardarDocumento(formData: FormData): Promise<void> {
  await requireFullAccess();
  const shipmentId = str(formData, "shipmentId");
  const archivoUrl = str(formData, "archivoUrl");
  if (!shipmentId || !archivoUrl?.startsWith("data:")) throw new Error("Archivo inválido");
  await prisma.documento.create({
    data: {
      shipmentId,
      nombre: str(formData, "nombre") ?? "Documento",
      archivoUrl,
      tipo: str(formData, "tipo"),
    },
  });
  revalidatePath(`/embarques/${shipmentId}`);
}

export async function eliminarDocumento(id: string, shipmentId: string): Promise<void> {
  await requireFullAccess();
  await prisma.documento.delete({ where: { id } });
  revalidatePath(`/embarques/${shipmentId}`);
}

export async function updateShipmentCosts(shipmentId: string, formData: FormData): Promise<void> {
  await requireFullAccess();
  const tienePrecios = formData.has("precioFleteUSA");
  // Si la unidad ya tiene Flete USA desglosado en gastos individuales
  // (viáticos, vuelos, seguro/permiso/placas...), ese costo se administra
  // SOLO desde ahí (guardarGastosFleteUSA/eliminarGastoFleteUSA) — aquí se
  // ignora para no pisarlo con un monto suelto desde otra pantalla (ej. la
  // tabla editable de /costos).
  const tieneGastosFleteUSA = (await prisma.gastoFleteUSA.count({ where: { shipmentId } })) > 0;

  await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      ...(tieneGastosFleteUSA ? {} : { costoFleteUSA: num(formData, "costoFleteUSA") }),
      costoImportacion: num(formData, "costoImportacion"),
      costoManiobras: num(formData, "costoManiobras"),
      costoFleteMx: num(formData, "costoFleteMx"),
      costoPermiso: num(formData, "costoPermiso"),
      // Seguro/Placas se separaron después; si una pantalla todavía no los
      // manda (ej. la tabla editable de /costos), no se pisan con 0.
      ...(formData.has("costoSeguro") ? { costoSeguro: num(formData, "costoSeguro") } : {}),
      ...(formData.has("costoPlacas") ? { costoPlacas: num(formData, "costoPlacas") } : {}),
      ...(formData.has("costoBondCanada") ? { costoBondCanada: num(formData, "costoBondCanada") } : {}),
      costoRepuveTitulo: num(formData, "costoRepuveTitulo"),
      fleteMexAplica: formData.get("fleteMexAplica") === "on",
      ...(tienePrecios
        ? {
            precioFleteUSA: num(formData, "precioFleteUSA"),
            precioImportacion: num(formData, "precioImportacion"),
            precioFleteMx: num(formData, "precioFleteMx"),
            precioPermiso: num(formData, "precioPermiso"),
            precioSeguro: num(formData, "precioSeguro"),
            precioPlacas: num(formData, "precioPlacas"),
          }
        : {}),
    },
  });

  sincronizarUnidadDespues(shipmentId);

  revalidatePath(`/embarques/${shipmentId}`);
  revalidatePath("/costos");
  revalidatePath("/analitica");
  revalidatePath("/ventas");
}

export async function deleteShipment(shipmentId: string) {
  await requireFullAccess();
  // Borrar la unidad borraría en cascada sus órdenes de pago (y con ellas
  // folios y pagos ya enviados al ERP). Una unidad con órdenes no se borra.
  const ordenes = await prisma.paymentOrder.count({ where: { shipmentId } });
  if (ordenes > 0) {
    throw new Error("Esta unidad tiene órdenes de pago; no se puede eliminar.");
  }
  const s = await prisma.shipment.findUnique({ where: { id: shipmentId }, select: { folio: true, erpId: true } });
  await prisma.shipment.delete({ where: { id: shipmentId } });
  await registrarAuditoria({
    accion: "unidad.eliminar",
    entidad: "Shipment",
    entidadId: s?.folio ?? shipmentId,
    usuario: await usuarioBitacora(),
    detalle: s?.erpId ? `Trato ${s.erpId}` : null,
  });
  revalidatePath("/");
  revalidatePath("/operaciones");
  redirect("/operaciones");
}

// ---------------------------------------------------------------------------
// Orden de pago
// ---------------------------------------------------------------------------

// Igual que nextFolio(): se basa en el folio más alto existente, no en un
// conteo, para que borrar/cancelar una orden no provoque un folio repetido.
async function nextOrderFolio() {
  const last = await prisma.paymentOrder.findFirst({
    orderBy: { folio: "desc" },
    select: { folio: true },
  });
  const n = last ? parseInt(last.folio.split("-").pop() ?? "0", 10) || 0 : 0;
  return `OP-2026-${String(n + 1).padStart(4, "0")}`;
}

export async function generarOrdenDePago(shipmentId: string, formData: FormData): Promise<void> {
  await requireFullAccess();
  const generadaPor = await nombreSesion();
  const notas = str(formData, "notas");
  // antes de tocar nada: proveedor y cuenta tienen que salir del catálogo
  const datosBancarios = await datosBancariosDesdeCatalogo(formData);

  const s = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { gastosFleteUSA: { where: { paymentOrderId: null }, orderBy: { fecha: "asc" } } },
  });
  if (!s) throw new Error("Embarque no encontrado");

  // Flete USA no es un solo monto — son varios gastos que se van sumando
  // (viáticos, vuelos, seguro/permiso/placas, gastos generales, reparación,
  // pago operador, ver GastoFleteUSA / FLETE_USA_SLOTS). Si el equipo ya
  // tiene gastos capturados así, cada concepto se puede incluir o no por
  // separado en esta orden (una casilla por concepto); lo que no encaje en
  // ninguno de esos 6 conceptos (ej. un monto previo sin desglosar) cae en
  // "Otros gastos de Flete USA". Si todavía no se ha capturado ningún gasto
  // (equipos viejos), se comporta como antes: un solo monto editable.
  const sinPagarFleteUSA = s.gastosFleteUSA;
  const usaGastosFleteUSA = sinPagarFleteUSA.length > 0;
  const otrosSinSlot = sinPagarFleteUSA.filter(
    (g) => !FLETE_USA_SLOTS.some((slot) => gastoFleteUSAPerteneceASlot(g.concepto, slot.key))
  );

  const gastosMarcados = usaGastosFleteUSA
    ? [
        ...sinPagarFleteUSA.filter((g) =>
          FLETE_USA_SLOTS.some(
            (slot) => gastoFleteUSAPerteneceASlot(g.concepto, slot.key) && formData.get(`incluirFleteUSA_${slot.key}`) === "on"
          )
        ),
        ...(formData.get("incluirFleteUSA_otros") === "on" ? otrosSinSlot : []),
      ]
    : [];

  let montoFleteUSA: number;
  if (usaGastosFleteUSA) {
    montoFleteUSA = gastosMarcados.reduce((a, g) => a + g.monto, 0);
  } else {
    const valor = formData.get("costoFleteUSA");
    montoFleteUSA = typeof valor === "string" && valor.trim() !== "" ? num(formData, "costoFleteUSA") : s.costoFleteUSA;
  }

  // Los demás conceptos siguen igual que siempre: un solo monto editable
  // aquí mismo, que se guarda en el equipo aunque el concepto esté desmarcado.
  const OTROS_CONCEPTOS = [
    { campo: "costoImportacion", check: "incluirImportacion", label: "Importación / Aduana" },
    { campo: "costoBondCanada", check: "incluirBondCanada", label: "Bond/Canadá" },
    { campo: "costoManiobras", check: "incluirManiobras", label: "Maniobra/Reparación" },
    { campo: "costoFleteMx", check: "incluirFleteMx", label: "Flete México" },
    { campo: "costoPermiso", check: "incluirPermiso", label: "Permiso" },
    { campo: "costoSeguro", check: "incluirSeguro", label: "Seguro" },
    { campo: "costoPlacas", check: "incluirPlacas", label: "Placas" },
    { campo: "costoRepuveTitulo", check: "incluirRepuveTitulo", label: "Repuve/Título" },
  ] as const;

  const costosActualizados: Record<string, number> = usaGastosFleteUSA ? {} : { costoFleteUSA: montoFleteUSA };
  for (const c of OTROS_CONCEPTOS) {
    const valor = formData.get(c.campo);
    costosActualizados[c.campo] = typeof valor === "string" && valor.trim() !== ""
      ? num(formData, c.campo)
      : (s[c.campo as keyof typeof s] as number);
  }
  validarMontos(costosActualizados);
  if (gastosMarcados.some((g) => g.monto < 0)) throw new Error("Hay gastos de Flete USA con monto negativo.");
  const shipmentActualizado = await prisma.shipment.update({
    where: { id: shipmentId },
    data: costosActualizados,
  });

  const incluirFleteUSA = usaGastosFleteUSA ? gastosMarcados.length > 0 : formData.get("incluirFleteUSA") === "on";
  const montos: Record<string, number> = {
    costoFleteUSA: incluirFleteUSA ? montoFleteUSA : 0,
    costoImportacion: 0,
    costoBondCanada: 0,
    costoManiobras: 0,
    costoFleteMx: 0,
    costoPermiso: 0,
    costoSeguro: 0,
    costoPlacas: 0,
    costoRepuveTitulo: 0,
  };
  const etiquetas: string[] = [];
  if (incluirFleteUSA) etiquetas.push("Flete USA");
  for (const c of OTROS_CONCEPTOS) {
    if (formData.get(c.check) === "on") {
      montos[c.campo] = shipmentActualizado[c.campo as keyof typeof shipmentActualizado] as number;
      etiquetas.push(c.label);
    }
  }

  const concepto =
    etiquetas.length === 0
      ? "Sin conceptos"
      : etiquetas.length === OTROS_CONCEPTOS.length + 1
        ? "Todos los conceptos"
        : etiquetas.join(" + ");

  validarMontos(montos);
  const total = redondear2(Object.values(montos).reduce((a, b) => a + b, 0));
  const tipoCambioTexto = str(formData, "tipoCambio");
  const tipoCambio = tipoCambioTexto ? num(formData, "tipoCambio") : null;

  // Gasto del chofer (pidió Alma): la parte del Flete USA de esta orden que
  // es "Pago operador". Ya va dentro de costoFleteUSA y del total.
  const gastoAdicionalFlete = redondear2(
    gastosMarcados.filter((g) => gastoFleteUSAPerteneceASlot(g.concepto, "operador")).reduce((a, g) => a + g.monto, 0)
  );

  const detalleFleteUSA =
    usaGastosFleteUSA && gastosMarcados.length > 0
      ? gastosMarcados.map((g) => `${g.concepto}: ${formatMoneyPlano(g.monto)}`).join(" | ")
      : null;

  const order = await prisma.paymentOrder.create({
    data: {
      folio: await nextOrderFolio(),
      shipmentId,
      generadaPor,
      notas,
      costoFleteUSA: montos.costoFleteUSA,
      costoImportacion: montos.costoImportacion,
      costoBondCanada: montos.costoBondCanada,
      costoManiobras: montos.costoManiobras,
      costoFleteMx: montos.costoFleteMx,
      costoPermiso: montos.costoPermiso,
      costoSeguro: montos.costoSeguro,
      costoPlacas: montos.costoPlacas,
      costoRepuveTitulo: montos.costoRepuveTitulo,
      concepto,
      total,
      tipoCambio: tipoCambio && tipoCambio > 0 ? tipoCambio : null,
      detalleFleteUSA,
      costoGastoAdicionalFlete: gastoAdicionalFlete,
      ...datosBancarios,
    },
  });

  if (gastosMarcados.length > 0) {
    await prisma.gastoFleteUSA.updateMany({
      where: { id: { in: gastosMarcados.map((g) => g.id) } },
      data: { paymentOrderId: order.id },
    });
  }

  await registrarAuditoria({
    accion: "orden.crear",
    entidad: "PaymentOrder",
    entidadId: order.folio,
    usuario: await usuarioBitacora(),
    detalle: `Unidad ${s.folio} · total USD ${total} · proveedor ${datosBancarios.proveedorNombre}`,
  });

  await enviarOrdenAlERP(order.id);

  revalidatePath(`/embarques/${shipmentId}`);
  revalidatePath("/costos");
  redirect(`/orden-pago/${order.id}`);
}

// ---------------------------------------------------------------------------
// Gastos de Flete USA (viáticos, vuelos, gastos generales, comisión, etc.)
// ---------------------------------------------------------------------------

function formatMoneyPlano(n: number) {
  return `$${n.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

async function recalcularCostoFleteUSA(shipmentId: string) {
  const suma = await prisma.gastoFleteUSA.aggregate({
    where: { shipmentId },
    _sum: { monto: true },
  });
  await prisma.shipment.update({
    where: { id: shipmentId },
    data: { costoFleteUSA: suma._sum.monto ?? 0 },
  });
}

// Guarda de un solo golpe los 6 conceptos fijos de Flete USA (ver
// FLETE_USA_SLOTS): un formulario con una casilla de monto por concepto,
// en vez de ir agregando uno por uno. Reemplaza lo que esta unidad tuviera
// SIN PAGAR en cada concepto (lo ya incluido en una orden de pago se deja
// como historial, no se toca) y, si el monto de un concepto queda en 0, ese
// concepto simplemente no se guarda.
export async function guardarGastosFleteUSA(shipmentId: string, formData: FormData) {
  await requireFullAccess();

  // Si esta unidad ya traía un monto de Flete USA capturado de un solo
  // golpe (como era antes de desglosarlo) y todavía no tiene NINGÚN gasto
  // itemizado, el primer guardado aquí "reiniciaría" el total
  // (recalcularCostoFleteUSA suma solo los gastos). Para no perder ese
  // monto previo, se guarda como un gasto más antes de aplicar lo nuevo.
  const yaTieneGastos = (await prisma.gastoFleteUSA.count({ where: { shipmentId } })) > 0;
  if (!yaTieneGastos) {
    const s = await prisma.shipment.findUnique({ where: { id: shipmentId }, select: { costoFleteUSA: true } });
    if (s && s.costoFleteUSA > 0) {
      await prisma.gastoFleteUSA.create({
        data: { shipmentId, concepto: "Monto previo (antes del desglose)", monto: s.costoFleteUSA, fecha: new Date() },
      });
    }
  }

  const sinPagar = await prisma.gastoFleteUSA.findMany({ where: { shipmentId, paymentOrderId: null } });
  const nombreOperador = str(formData, "nombreOperador");
  const fecha = new Date();

  for (const slot of FLETE_USA_SLOTS) {
    const monto = num(formData, `monto_${slot.key}`);
    const idsDeEsteSlot = sinPagar.filter((g) => gastoFleteUSAPerteneceASlot(g.concepto, slot.key)).map((g) => g.id);
    if (idsDeEsteSlot.length > 0) {
      await prisma.gastoFleteUSA.deleteMany({ where: { id: { in: idsDeEsteSlot } } });
    }
    if (monto > 0) {
      const concepto = slot.key === "operador" && nombreOperador ? `Pago operador: ${nombreOperador}` : slot.label;
      await prisma.gastoFleteUSA.create({ data: { shipmentId, concepto, monto, fecha } });
    }
  }

  await recalcularCostoFleteUSA(shipmentId);
  sincronizarUnidadDespues(shipmentId);

  revalidatePath(`/embarques/${shipmentId}`);
  revalidatePath("/costos");
}

export async function eliminarGastoFleteUSA(id: string) {
  await requireFullAccess();
  const actual = await prisma.gastoFleteUSA.findUnique({ where: { id }, select: { paymentOrderId: true } });
  // un gasto que ya va en una orden de pago es historial: no se borra
  if (actual?.paymentOrderId) throw new Error("Ese gasto ya está incluido en una orden de pago; no se puede eliminar.");
  const gasto = await prisma.gastoFleteUSA.delete({ where: { id } });
  await recalcularCostoFleteUSA(gasto.shipmentId);
  sincronizarUnidadDespues(gasto.shipmentId);

  revalidatePath(`/embarques/${gasto.shipmentId}`);
  revalidatePath("/costos");
}

// "Marcar como pagada" ya no existe: el pago solo lo confirma Finanzas desde
// el ERP (POST /api/erp/ordenes-pago/estatus).

// Cancelar = reenviar la orden al ERP con estatusPago "Cancelada". Solo si el
// ERP lo confirma se cancela aquí; si Finanzas ya la pagó, el ERP responde
// 417 y la orden no cambia (el mensaje queda visible en la orden). Al
// cancelar, sus gastos de Flete USA se liberan para poder incluirlos en una
// orden nueva (con folio nuevo).
export async function cancelarOrdenDePago(orderId: string): Promise<void> {
  await requireFullAccess();
  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
  if (!order || order.eliminadaAt) return;

  if (order.estatusPago !== ESTATUS_PAGO.PENDIENTE) {
    await prisma.paymentOrder.update({
      where: { id: orderId },
      data: { erpError: `Solo se pueden cancelar órdenes pendientes (esta está "${order.estatusPago}").` },
    });
    redirect(`/orden-pago/${orderId}`);
  }

  const r = await cancelarOrdenEnERP(orderId);
  const usuario = await usuarioBitacora();
  if (!r.ok) {
    await prisma.paymentOrder.update({
      where: { id: orderId },
      data: { erpError: `No se canceló: ${r.error ?? "el ERP no lo confirmó"}`.slice(0, 500) },
    });
    await registrarAuditoria({
      accion: "orden.cancelar.rechazada",
      entidad: "PaymentOrder",
      entidadId: order.folio,
      usuario,
      detalle: r.error ?? null,
    });
    revalidatePath(`/orden-pago/${orderId}`);
    redirect(`/orden-pago/${orderId}`);
  }

  await prisma.$transaction([
    prisma.paymentOrder.updateMany({
      where: { id: orderId, estatusPago: ESTATUS_PAGO.PENDIENTE },
      data: { estatusPago: ESTATUS_PAGO.CANCELADA, erpError: null },
    }),
    prisma.gastoFleteUSA.updateMany({ where: { paymentOrderId: orderId }, data: { paymentOrderId: null } }),
  ]);
  await registrarAuditoria({ accion: "orden.cancelar", entidad: "PaymentOrder", entidadId: order.folio, usuario });

  revalidatePath("/costos");
  revalidatePath(`/orden-pago/${orderId}`);
  if (order.shipmentId) revalidatePath(`/embarques/${order.shipmentId}`);
}

// Solo se eliminan órdenes canceladas, y con borrado lógico: la fila se
// queda (con su folio) y solo deja de mostrarse. Pendientes y pagadas no se
// eliminan.
export async function eliminarOrdenDePago(orderId: string): Promise<void> {
  await requireFullAccess();
  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
  if (!order || order.eliminadaAt) return;

  if (order.estatusPago !== ESTATUS_PAGO.CANCELADA) {
    await prisma.paymentOrder.update({
      where: { id: orderId },
      data: { erpError: "Solo se pueden eliminar órdenes canceladas." },
    });
    redirect(`/orden-pago/${orderId}`);
  }

  await prisma.paymentOrder.update({ where: { id: orderId }, data: { eliminadaAt: new Date() } });
  await registrarAuditoria({
    accion: "orden.eliminar",
    entidad: "PaymentOrder",
    entidadId: order.folio,
    usuario: await usuarioBitacora(),
  });

  revalidatePath("/costos");
  if (!order.shipmentId) redirect("/costos");
  revalidatePath(`/embarques/${order.shipmentId}`);
  redirect(`/embarques/${order.shipmentId}`);
}

// Orden de pago GENERAL — no ligada a ninguna unidad, para gastos que no
// corresponden a un equipo en particular (ej. renta de oficina, gastos
// varios). El desglose (uno o más conceptos con su monto) se captura todo
// junto en el mismo formulario, como pares "gastoDescripcion"/"gastoMonto".
export async function generarOrdenDePagoGeneral(formData: FormData): Promise<void> {
  await requireFullAccess();

  const descripciones = formData.getAll("gastoDescripcion").map((v) => String(v).trim());
  const montosTexto = formData.getAll("gastoMonto").map((v) => String(v));
  const items = descripciones
    .map((descripcion, i) => ({
      descripcion,
      monto: Number((montosTexto[i] ?? "0").replace(/[^0-9.-]/g, "")) || 0,
    }))
    .filter((it) => it.descripcion && it.monto > 0);

  if (items.length === 0) {
    throw new Error("Agrega al menos un gasto con descripción y monto.");
  }

  if (items.some((it) => it.monto < 0)) throw new Error("Los montos no pueden ser negativos.");
  for (const it of items) it.monto = redondear2(it.monto);
  const datosBancarios = await datosBancariosDesdeCatalogo(formData);
  const total = redondear2(items.reduce((a, it) => a + it.monto, 0));
  const concepto = str(formData, "concepto") || "Otros / Gastos generales";
  const tipoCambioTexto = str(formData, "tipoCambio");
  const tipoCambio = tipoCambioTexto ? num(formData, "tipoCambio") : null;

  const order = await prisma.paymentOrder.create({
    data: {
      folio: await nextOrderFolio(),
      generadaPor: await nombreSesion(),
      notas: str(formData, "notas"),
      costoFleteUSA: 0,
      costoImportacion: 0,
      costoManiobras: 0,
      costoFleteMx: 0,
      costoPermiso: 0,
      total,
      concepto,
      tipoCambio: tipoCambio && tipoCambio > 0 ? tipoCambio : null,
      ...datosBancarios,
      gastosGenerales: { create: items },
    },
  });

  await registrarAuditoria({
    accion: "orden.crear",
    entidad: "PaymentOrder",
    entidadId: order.folio,
    usuario: await usuarioBitacora(),
    detalle: `Orden general · total USD ${total} · proveedor ${datosBancarios.proveedorNombre}`,
  });

  await enviarOrdenAlERP(order.id);

  revalidatePath("/costos");
  redirect(`/orden-pago/${order.id}`);
}

export async function reintentarEnvioERP(orderId: string): Promise<void> {
  await requireFullAccess();
  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId }, select: { estatusPago: true, eliminadaAt: true } });
  // una orden pagada o cancelada no se vuelve a mandar desde aquí
  if (!order || order.eliminadaAt || order.estatusPago !== ESTATUS_PAGO.PENDIENTE) return;
  await enviarOrdenAlERP(orderId);
  revalidatePath(`/orden-pago/${orderId}`);
}

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------

export async function createSale(formData: FormData) {
  await requireFullAccess();
  await prisma.sale.create({
    data: {
      vendedor: str(formData, "vendedor") ?? "Otro",
      comprador: str(formData, "comprador"),
      tipoUnidad: str(formData, "tipoUnidad"),
      tiempoCicloDias: (() => {
        const v = str(formData, "tiempoCicloDias");
        return v ? Number(v) : null;
      })(),
      fecha: dateOrNull(formData, "fecha"),
      mes: str(formData, "mes"),
      anio: 2026,
      fleteMex: formData.get("fleteMex") === "on",
      shipmentId: str(formData, "shipmentId") || null,
      origenDato: "app",
    },
  });

  revalidatePath("/ventas");
  revalidatePath("/analitica");
}

// ---------------------------------------------------------------------------
// Comentarios / recordatorios
// ---------------------------------------------------------------------------

export async function createComment(formData: FormData) {
  await requireFullAccess();
  await prisma.comment.create({
    data: {
      shipmentId: str(formData, "shipmentId") || null,
      texto: str(formData, "texto") ?? "",
      tipo: str(formData, "tipo") ?? "comentario",
      autor: str(formData, "autor"),
      fechaRecordatorio: dateOrNull(formData, "fechaRecordatorio"),
    },
  });

  revalidatePath("/");
  revalidatePath("/reportes");
  if (str(formData, "shipmentId")) {
    revalidatePath(`/embarques/${str(formData, "shipmentId")}`);
  }
}

export async function resolveComment(id: string) {
  await requireFullAccess();
  await prisma.comment.update({ where: { id }, data: { resuelto: true } });
  revalidatePath("/");
  revalidatePath("/reportes");
}

export async function updateComment(formData: FormData) {
  await requireFullAccess();
  const id = str(formData, "id");
  if (!id) return;
  const comment = await prisma.comment.update({
    where: { id },
    data: { texto: str(formData, "texto") ?? "" },
  });
  revalidatePath("/");
  revalidatePath("/reportes");
  if (comment.shipmentId) {
    revalidatePath(`/embarques/${comment.shipmentId}`);
  }
}

export async function deleteComment(id: string) {
  await requireFullAccess();
  const comment = await prisma.comment.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/reportes");
  if (comment.shipmentId) {
    revalidatePath(`/embarques/${comment.shipmentId}`);
  }
}

// ---------------------------------------------------------------------------
// Cotizaciones
// ---------------------------------------------------------------------------

export async function crearCotizacion(formData: FormData) {
  await requireFullAccess();
  const folio = await nextCotizacionFolio();

  const cotizacion = await prisma.cotizacion.create({
    data: {
      folio,
      cliente: str(formData, "cliente") ?? "Sin cliente",
      tipoMaquina: str(formData, "tipoMaquina") ?? "Equipo",
      anio: str(formData, "anio"),
      origenCiudad: str(formData, "origenCiudad"),
      destinoCiudad: str(formData, "destinoCiudad"),
      fotoUrl: await normalizarFoto(str(formData, "fotoUrl")),
      vendedor: str(formData, "vendedor"),
      costoFleteUSA: num(formData, "costoFleteUSA"),
      costoImportacion: num(formData, "costoImportacion"),
      costoManiobras: num(formData, "costoManiobras"),
      costoFleteMx: num(formData, "costoFleteMx"),
      costoPermiso: num(formData, "costoPermiso"),
      ivaPorcentaje: num(formData, "ivaPorcentaje"),
      notas: str(formData, "notas") ?? null,
    },
  });

  revalidatePath("/cotizaciones");
  redirect(`/cotizaciones/${cotizacion.id}`);
}

export async function editarCotizacion(id: string, formData: FormData) {
  await requireFullAccess();
  await prisma.cotizacion.update({
    where: { id },
    data: {
      cliente: str(formData, "cliente") ?? "Sin cliente",
      tipoMaquina: str(formData, "tipoMaquina") ?? "Equipo",
      anio: str(formData, "anio") ?? null,
      origenCiudad: str(formData, "origenCiudad") ?? null,
      destinoCiudad: str(formData, "destinoCiudad") ?? null,
      fotoUrl: await normalizarFoto(str(formData, "fotoUrl")),
      vendedor: str(formData, "vendedor") ?? null,
      costoFleteUSA: num(formData, "costoFleteUSA"),
      costoImportacion: num(formData, "costoImportacion"),
      costoManiobras: num(formData, "costoManiobras"),
      costoFleteMx: num(formData, "costoFleteMx"),
      costoPermiso: num(formData, "costoPermiso"),
      ivaPorcentaje: num(formData, "ivaPorcentaje"),
      notas: str(formData, "notas") ?? null,
    },
  });
  revalidatePath("/cotizaciones");
  revalidatePath(`/cotizaciones/${id}`);
  redirect(`/cotizaciones/${id}`);
}

export async function eliminarCotizacion(id: string) {
  await requireFullAccess();
  await prisma.cotizacion.delete({ where: { id } });
  revalidatePath("/cotizaciones");
  redirect("/cotizaciones");
}

export async function rechazarCotizacion(id: string) {
  await requireFullAccess();
  await prisma.cotizacion.update({ where: { id }, data: { estatus: "Rechazada" } });
  revalidatePath("/cotizaciones");
  revalidatePath(`/cotizaciones/${id}`);
}

// Cuando el cliente acepta la cotización, se da de alta como unidad real
// (Shipment) para heredar gratis todo el seguimiento de Operaciones/Costos,
// igual que se hizo con "Servicio Logístico". Queda ligada por shipmentId.
export async function aceptarCotizacion(id: string) {
  await requireFullAccess();
  const cot = await prisma.cotizacion.findUnique({ where: { id }, omit: { fotoUrl: false } });
  if (!cot || cot.shipmentId) return;

  const folio = await nextFolio();
  const shipment = await prisma.shipment.create({
    data: {
      folio,
      equipoDescripcion: `${cot.tipoMaquina}${cot.anio ? ` ${cot.anio}` : ""}`,
      serie: "S/N",
      cliente: cot.cliente,
      vendedor: cot.vendedor,
      fotoUrl: cot.fotoUrl,
      estatus: "Pendiente",
      origenCiudad: cot.origenCiudad,
      destinoCiudad: cot.destinoCiudad,
      costoFleteUSA: cot.costoFleteUSA,
      costoImportacion: cot.costoImportacion,
      costoManiobras: cot.costoManiobras,
      costoFleteMx: cot.costoFleteMx,
      costoPermiso: cot.costoPermiso,
      fechaInicio: new Date(),
    },
  });

  await prisma.statusEvent.create({
    data: {
      shipmentId: shipment.id,
      estatusNuevo: shipment.estatus,
      usuario: cot.vendedor ?? "Sistema",
      comentario: `Unidad dada de alta a partir de la cotización ${cot.folio} (aceptada por el cliente)`,
    },
  });
  sincronizarUnidadDespues(shipment.id);

  await prisma.cotizacion.update({
    where: { id: cot.id },
    data: { estatus: "Aceptada", shipmentId: shipment.id },
  });

  revalidatePath("/cotizaciones");
  revalidatePath("/");
  revalidatePath("/operaciones");
  redirect(`/embarques/${shipment.id}`);
}

// ---------------------------------------------------------------------------
// Importar datos (Excel/CSV)
// ---------------------------------------------------------------------------

export interface ImportShipmentRow {
  semana?: number;
  equipoDescripcion: string;
  categoria?: string;
  tipoUnidad?: string;
  cliente: string;
  serie: string;
  vendedor?: string;
  estatus?: string;
  origenCiudad?: string;
  aduana?: string;
  destinoCiudad?: string;
  proveedorCompra?: string;
  provFleteUSA?: string;
  provAgenteAduanal?: string;
  costoFleteUSA?: number;
  costoImportacion?: number;
  costoManiobras?: number;
  costoFleteMx?: number;
  costoPermiso?: number;
  costoRepuveTitulo?: number;
}

export async function importShipments(rows: ImportShipmentRow[]) {
  await requireFullAccess();
  const last = await prisma.shipment.findFirst({ orderBy: { folio: "desc" }, select: { folio: true } });
  let count = last ? parseInt(last.folio.split("-").pop() ?? "0", 10) || 0 : 0;
  let creados = 0;
  for (const row of rows) {
    if (!row.equipoDescripcion || !row.cliente) continue;
    count += 1;
    await prisma.shipment.create({
      data: {
        folio: `MH-2026-${String(count).padStart(4, "0")}`,
        semana: row.semana,
        equipoDescripcion: row.equipoDescripcion,
        categoria: row.categoria,
        tipoUnidad: row.tipoUnidad,
        cliente: row.cliente,
        serie: row.serie || "S/N",
        vendedor: row.vendedor,
        estatus: row.estatus || "Pendiente",
        origenCiudad: row.origenCiudad,
        aduana: row.aduana,
        destinoCiudad: row.destinoCiudad,
        proveedorCompra: row.proveedorCompra,
        provFleteUSA: row.provFleteUSA,
        provAgenteAduanal: row.provAgenteAduanal,
        costoFleteUSA: row.costoFleteUSA ?? 0,
        costoImportacion: row.costoImportacion ?? 0,
        costoManiobras: row.costoManiobras ?? 0,
        costoFleteMx: row.costoFleteMx ?? 0,
        costoPermiso: row.costoPermiso ?? 0,
        costoRepuveTitulo: row.costoRepuveTitulo ?? 0,
      },
    });
    creados += 1;
  }

  revalidatePath("/");
  revalidatePath("/operaciones");
  revalidatePath("/costos");
  revalidatePath("/mapa");
  return creados;
}

// ---------------------------------------------------------------------------
// Estimaciones de costos (bandeja "Por cotizar")
// ---------------------------------------------------------------------------

export async function capturarEstimacion(formData: FormData) {
  await requireFullAccess();
  const id = str(formData, "id");
  if (!id) throw new Error("Falta la solicitud.");
  const fleteUSA = num(formData, "estFleteUSA");
  const importacion = num(formData, "estImportacion");
  validarMontos({ "Flete USA": fleteUSA, Importación: importacion });
  const estimadoPor = await nombreSesion();

  const actual = await prisma.solicitudEstimacion.findUnique({ where: { id } });
  if (!actual) throw new Error("Solicitud no encontrada.");
  if (actual.estatus === "Cancelada") throw new Error("Compras canceló esta solicitud.");

  await prisma.solicitudEstimacion.update({
    where: { id },
    data: {
      estFleteUSA: fleteUSA,
      estImportacion: importacion,
      estimadoPor,
      estimadoAt: new Date(),
      estatus: "Estimada",
      erpEnviado: false,
      erpError: null,
    },
  });
  await registrarAuditoria({
    accion: "estimacion.capturar",
    entidad: "SolicitudEstimacion",
    entidadId: actual.erpEquipoId,
    usuario: await usuarioBitacora(),
    detalle: `Flete USA ${fleteUSA} · Importación ${importacion}`,
  });
  await enviarEstimacionAlERP(id);
  revalidatePath("/por-cotizar");
}

export async function reenviarEstimacion(formData: FormData) {
  await requireFullAccess();
  const id = str(formData, "id");
  if (!id) throw new Error("Falta la solicitud.");
  await enviarEstimacionAlERP(id);
  revalidatePath("/por-cotizar");
}
