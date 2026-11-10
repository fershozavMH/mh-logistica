import SubmitButton from "@/components/SubmitButton";
import FotoMini from "@/components/FotoMini";
import { fotoSrc } from "@/lib/foto-url";
import Link from "next/link";
import { notFound } from "next/navigation";
import TopBar from "@/components/TopBar";
import { Card, CardHeader, StatusBadge, EmptyState, SerieTag, ClockBadge, MoneyInput } from "@/components/ui";
import UserSelect from "@/components/UserSelect";
import SelectOrNew from "@/components/SelectOrNew";
import ProveedorCuentaSelect from "@/components/ProveedorCuentaSelect";
import { CostosSyncProvider, SyncedMoneyInput, SyncedHiddenInput, SyncedTotal, type CostoCampo } from "@/components/CostosSync";
import GastosFleteUSA from "@/components/GastosFleteUSA";
import ConfirmZeroCostButton from "@/components/ConfirmZeroCostButton";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import FotoEquipo from "@/components/FotoEquipo";
import DocumentosEmbarque from "@/components/DocumentosEmbarque";
import EstatusTimeline from "@/components/EstatusTimeline";
import HistorialEstatusEditable from "@/components/HistorialEstatusEditable";
import CategoriaTipoSelect from "@/components/CategoriaTipoSelect";
import { getShipment, getProveedores } from "@/lib/queries";
import { esSoloLectura } from "@/lib/auth-server";
import { sincronizarProveedores, getOpcionesProveedores, getEstadoProveedores } from "@/lib/erp";
import {
  updateShipmentEstatusForm,
  updateShipmentInfo,
  updateShipmentCosts,
  generarOrdenDePago,
  cancelarOrdenDePago,
  eliminarOrdenDePago,
  createComment,
  resolveComment,
  deleteShipment,
  actualizarCatalogoProveedores,
} from "@/lib/actions";
import { ADUANAS, ESTATUS_FLOW, VENDEDORES, estatusInfo, formatFecha, formatMXN, FLETE_USA_SLOTS, gastoFleteUSAPerteneceASlot } from "@/lib/constants";
import { calcularDuracionPorEtapa, calcularTimelineEstatus } from "@/lib/ciclo";
import { Trash2, Printer } from "lucide-react";

export const dynamic = "force-dynamic";

function dateInputValue(d: Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export default async function EmbarqueDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [shipment, proveedores, soloLectura] = await Promise.all([getShipment(id), getProveedores(), esSoloLectura()]);
  if (!shipment) notFound();

  // Catálogo de proveedores del ERP para la orden de pago: se refresca al
  // abrir la unidad si pasaron más de 15 min desde la última vez.
  if (!soloLectura) await sincronizarProveedores({ rapido: true });
  const [opcionesProveedores, estadoProveedores] = soloLectura
    ? [[], null]
    : await Promise.all([getOpcionesProveedores(), getEstadoProveedores()]);
  const ultimaSyncProveedores =
    estadoProveedores && estadoProveedores.ultimaVez.getTime() > 0
      ? estadoProveedores.ultimaVez.toLocaleString("es-MX", { timeZone: "America/Hermosillo", dateStyle: "short", timeStyle: "short" })
      : null;

  const totalCostos =
    shipment.costoFleteUSA +
    shipment.costoImportacion +
    shipment.costoBondCanada +
    shipment.costoManiobras +
    shipment.costoFleteMx +
    shipment.costoPermiso +
    shipment.costoSeguro +
    shipment.costoPlacas +
    shipment.costoRepuveTitulo;

  const costoPorMilla = shipment.millas > 0 ? totalCostos / shipment.millas : null;

  // Si Flete USA ya está desglosado en gastos individuales, el monto de una
  // orden nueva es la suma de los que todavía no se han pagado — ya no se
  // escribe un solo monto suelto aquí (ver GastosFleteUSA).
  const gastosFleteUSANoPagados = shipment.gastosFleteUSA.filter((g) => !g.paymentOrderId);
  const fleteUSAItemizado = shipment.gastosFleteUSA.length > 0;
  const sumaFleteUSANoPagado = gastosFleteUSANoPagados.reduce((a, g) => a + g.monto, 0);
  const montosPorSlotFleteUSA = FLETE_USA_SLOTS.map((slot) => ({
    slot,
    monto: gastosFleteUSANoPagados.filter((g) => gastoFleteUSAPerteneceASlot(g.concepto, slot.key)).reduce((a, g) => a + g.monto, 0),
  }));

  const esServicio = shipment.tipoVenta === "Servicio Logístico";
  const totalPrecioServicio =
    shipment.precioFleteUSA + shipment.precioImportacion + shipment.precioFleteMx + shipment.precioPermiso +
    shipment.precioSeguro + shipment.precioPlacas;
  const utilidadServicio = totalPrecioServicio - totalCostos;

  const info = estatusInfo(shipment.estatus);

  // Cuántos días duró cada etapa (se usa en el historial de abajo).
  const duracionPorEvento = new Map(
    calcularDuracionPorEtapa(shipment.statusEvents, shipment.fechaEntrega).map((d) => [d.eventoId, d])
  );

  // Línea de tiempo de arriba de "Mover a la siguiente etapa": fecha en la que se alcanzó cada etapa.
  const timelineSteps = calcularTimelineEstatus(
    shipment.statusEvents,
    shipment.estatus,
    shipment.fechaInicio,
    shipment.createdAt
  );

  return (
    <>
      <TopBar title={shipment.folio} subtitle={shipment.equipoDescripcion} showBack />
      <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        <Card className="p-4 md:p-5">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="w-full md:w-64 shrink-0">
              {soloLectura ? (
                <FotoMini src={fotoSrc(shipment, "full")} className="w-full h-56 md:h-64 object-cover rounded-xl border border-border" fallbackClassName="w-full h-56 md:h-64 rounded-xl bg-gray-100 border border-border" />
              ) : (
                <FotoEquipo shipmentId={shipment.id} fotoUrl={fotoSrc(shipment, "full")} />
              )}
            </div>
            <div className="flex-1 flex flex-col justify-between gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-semibold text-ink-primary">{shipment.equipoDescripcion}</h2>
                    {esServicio && (
                      <span className="rounded-full bg-brand-blue-100 text-brand-blue-900 text-xs font-medium px-2.5 py-1">
                        Servicio Logístico
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink-muted flex items-center gap-2 flex-wrap mt-1">
                    <span>{shipment.cliente} {shipment.semana ? `· Semana ${shipment.semana}` : ""}</span>
                    <SerieTag serie={shipment.serie} />
                    <ClockBadge
                      fechaInicio={shipment.fechaInicio}
                      fechaEntrega={shipment.fechaEntrega}
                      tiempoCicloDias={shipment.tiempoCicloDias}
                    />
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge estatus={shipment.estatus} />
                  {!soloLectura && shipment._count.paymentOrders === 0 && (
                    <form action={deleteShipment.bind(null, shipment.id)}>
                      <ConfirmSubmitButton
                        confirmText={`¿Eliminar la unidad "${shipment.equipoDescripcion}" (serie ${shipment.serie})? Esto no se puede deshacer.`}
                        className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-brand-orange-700 border border-border rounded-lg px-3 py-1.5"
                        title="Eliminar unidad"
                      >
                        <Trash2 size={14} />
                        Eliminar
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Cambiar estatus */}
        {!soloLectura && (
          <Card>
            <CardHeader title="Mover a la siguiente etapa" subtitle={info.descripcion} />
            <EstatusTimeline steps={timelineSteps} />
            <form action={updateShipmentEstatusForm.bind(null, shipment.id)} className="p-5 space-y-4">
              <div className="flex flex-wrap gap-2">
                {ESTATUS_FLOW.map((e) => (
                  <SubmitButton
                    key={e.key}
                    type="submit"
                    name="estatus"
                    value={e.key}
                    className={`rounded-lg px-3 py-2 text-xs font-medium border transition-colors ${
                      e.key === shipment.estatus
                        ? `${e.bg} ${e.text} border-transparent`
                        : "border-border text-ink-secondary hover:bg-surface-muted"
                    }`}
                  >
                    {e.label}
                  </SubmitButton>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <UserSelect name="usuario" label="Registrado por" />
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-secondary">Fecha del movimiento</span>
                  <input type="date" name="fecha" defaultValue={dateInputValue(new Date())} className="rounded-lg border border-border px-3 py-2 text-sm" />
                  <span className="text-xs text-ink-muted">Normalmente déjala en hoy — solo cámbiala si estás capturando algo que ya pasó</span>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-secondary">Comentario del cambio (opcional)</span>
                  <input name="comentario" className="rounded-lg border border-border px-3 py-2 text-sm" placeholder="Ej. Cruzó en Calexico" />
                </label>
              </div>
            </form>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Información del embarque */}
          <Card>
            <CardHeader title="Información y ruta" />
            {soloLectura ? (
              <dl className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {[
                  ["Cliente", shipment.cliente],
                  ["Serie", shipment.serie],
                  ["Categoría", shipment.categoria],
                  ["Tipo de unidad", shipment.tipoUnidad === "CAMION" ? "Camión" : shipment.tipoUnidad === "AMARILLO" ? "Amarilla (maquinaria)" : null],
                  ["Vendedor", shipment.vendedor],
                  ["Origen", shipment.origenCiudad],
                  ["Aduana", shipment.aduana],
                  ["Destino", shipment.destinoCiudad],
                  ["Fecha de inicio", shipment.fechaInicio ? formatFecha(shipment.fechaInicio) : null],
                  ["Salida programada", shipment.fechaSalidaProgramada ? formatFecha(shipment.fechaSalidaProgramada) : null],
                  ["Fecha de cruce", shipment.fechaCruce ? formatFecha(shipment.fechaCruce) : null],
                  ["Proveedor de compra", shipment.proveedorCompra],
                  ["Proveedor flete USA", shipment.provFleteUSA],
                  ["Agente aduanal", shipment.provAgenteAduanal],
                  ["Millas recorridas", shipment.millas > 0 ? `${shipment.millas.toLocaleString("es-MX")} mi` : null],
                  ["ID en el ERP", shipment.erpId],
                  [
                    "Sincronización con ERP",
                    shipment.origenERP
                      ? "Unidad enviada por el ERP"
                      : shipment.erpUnidadSincronizada
                        ? "Enviada al ERP"
                        : shipment.erpUnidadError
                          ? `No enviada: ${shipment.erpUnidadError}`
                          : "Pendiente de enviar",
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-ink-muted">{label}</dt>
                    <dd className="text-ink-primary">{value || "—"}</dd>
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <dt className="text-xs text-ink-muted">Incidencias / notas</dt>
                  <dd className="text-ink-primary whitespace-pre-wrap">{shipment.incidencias || "—"}</dd>
                </div>
              </dl>
            ) : (
            <form action={updateShipmentInfo.bind(null, shipment.id)} className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="text-ink-secondary">Descripción</span>
                <input name="equipoDescripcion" defaultValue={shipment.equipoDescripcion} className="rounded-lg border border-border px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Cliente</span>
                <input name="cliente" defaultValue={shipment.cliente} className="rounded-lg border border-border px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Serie</span>
                <input name="serie" defaultValue={shipment.serie} className="rounded-lg border border-border px-3 py-2 text-sm" />
              </label>
              <CategoriaTipoSelect tipoUnidadDefault={shipment.tipoUnidad} categoriaDefault={shipment.categoria} />
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Vendedor</span>
                <SelectOrNew
                  name="vendedor"
                  options={VENDEDORES}
                  defaultValue={shipment.vendedor ?? ""}
                  placeholder="Nombre del vendedor"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Origen</span>
                <input name="origenCiudad" defaultValue={shipment.origenCiudad ?? ""} className="rounded-lg border border-border px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Aduana</span>
                <select name="aduana" defaultValue={shipment.aduana ?? ""} className="rounded-lg border border-border px-3 py-2 text-sm">
                  <option value="">Selecciona…</option>
                  {ADUANAS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Destino</span>
                <input name="destinoCiudad" defaultValue={shipment.destinoCiudad ?? ""} className="rounded-lg border border-border px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Fecha de inicio (arranca el reloj)</span>
                <input type="date" name="fechaInicio" defaultValue={dateInputValue(shipment.fechaInicio)} className="rounded-lg border border-border px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Salida programada</span>
                <input type="date" name="fechaSalidaProgramada" defaultValue={dateInputValue(shipment.fechaSalidaProgramada)} className="rounded-lg border border-border px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Fecha de cruce</span>
                <input type="date" name="fechaCruce" defaultValue={dateInputValue(shipment.fechaCruce)} className="rounded-lg border border-border px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Millas recorridas</span>
                <input
                  type="number"
                  name="millas"
                  min="0"
                  step="any"
                  defaultValue={shipment.millas || ""}
                  placeholder="Ej. 1850"
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">ID en el ERP</span>
                <input
                  value={shipment.erpId ?? ""}
                  readOnly
                  placeholder="Lo asigna el ERP"
                  className="rounded-lg border border-border px-3 py-2 text-sm bg-surface-muted text-ink-muted"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Proveedor de compra</span>
                <SelectOrNew
                  name="proveedorCompra"
                  options={proveedores.proveedorCompra}
                  defaultValue={shipment.proveedorCompra ?? ""}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Proveedor flete USA</span>
                <SelectOrNew
                  name="provFleteUSA"
                  options={proveedores.provFleteUSA}
                  defaultValue={shipment.provFleteUSA ?? ""}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Agente aduanal</span>
                <SelectOrNew
                  name="provAgenteAduanal"
                  options={proveedores.provAgenteAduanal}
                  defaultValue={shipment.provAgenteAduanal ?? ""}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="text-ink-secondary">Incidencias / notas</span>
                <textarea name="incidencias" defaultValue={shipment.incidencias ?? ""} className="rounded-lg border border-border px-3 py-2 text-sm min-h-16" />
              </label>
              <div className="sm:col-span-2 flex justify-end">
                <SubmitButton pendingText="Guardando…" className="rounded-lg bg-gray-900 text-white text-sm font-medium px-4 py-2 hover:opacity-90">
                  Guardar cambios
                </SubmitButton>
              </div>
            </form>
            )}
          </Card>

          {/* Costos y orden de pago */}
          {soloLectura ? (
            <div className="space-y-6">
              <Card>
                <CardHeader
                  title="Costos del embarque"
                  subtitle={esServicio ? "Costo real vs. precio al cliente" : "Flete USA (desglosado), importación, flete Mx y repuve/título"}
                />
                <div className="p-5 space-y-2">
                  {esServicio ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-ink-secondary">Flete USA</span>
                      <span className="text-ink-primary font-medium">
                        {formatMXN(shipment.costoFleteUSA)}
                        {shipment.precioFleteUSA > 0 && <span className="text-ink-muted"> · cliente {formatMXN(shipment.precioFleteUSA)}</span>}
                      </span>
                    </div>
                  ) : (
                    <GastosFleteUSA shipmentId={shipment.id} gastos={shipment.gastosFleteUSA} costoFleteUSA={shipment.costoFleteUSA} soloLectura />
                  )}
                  {[
                    { label: "Importación", costo: shipment.costoImportacion, precio: shipment.precioImportacion },
                    ...(shipment.costoBondCanada > 0 ? [{ label: "Bond/Canadá", costo: shipment.costoBondCanada, precio: 0 }] : []),
                    ...(esServicio ? [] : [{ label: "Maniobra/Reparación", costo: shipment.costoManiobras, precio: 0 }]),
                    { label: "Flete México", costo: shipment.costoFleteMx, precio: shipment.precioFleteMx },
                    { label: "Permiso", costo: shipment.costoPermiso, precio: shipment.precioPermiso },
                    { label: "Seguro", costo: shipment.costoSeguro, precio: shipment.precioSeguro },
                    { label: "Placas", costo: shipment.costoPlacas, precio: shipment.precioPlacas },
                    { label: "Repuve/Título", costo: shipment.costoRepuveTitulo, precio: 0 },
                  ].map((c) => (
                    <div key={c.label} className="flex items-center justify-between text-sm">
                      <span className="text-ink-secondary">{c.label}</span>
                      <span className="text-ink-primary font-medium">
                        {formatMXN(c.costo)}
                        {esServicio && c.precio > 0 && <span className="text-ink-muted"> · cliente {formatMXN(c.precio)}</span>}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-sm font-semibold text-ink-primary">Total</span>
                    <span className="text-lg font-semibold text-ink-primary">
                      {formatMXN(totalCostos)}
                      {esServicio && (
                        <span className={`ml-2 text-sm font-medium ${utilidadServicio >= 0 ? "text-brand-blue-700" : "text-red-600"}`}>
                          (utilidad {formatMXN(utilidadServicio)})
                        </span>
                      )}
                    </span>
                  </div>
                  {costoPorMilla !== null && (
                    <div className="flex items-center justify-between text-xs text-ink-muted">
                      <span>Costo por milla ({shipment.millas.toLocaleString("es-MX")} mi)</span>
                      <span>{formatMXN(costoPorMilla)} / mi</span>
                    </div>
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader title="Órdenes de pago" />
                {shipment.paymentOrders.length === 0 ? (
                  <EmptyState text="Sin órdenes de pago generadas." />
                ) : (
                  <ul className="divide-y divide-border">
                    {shipment.paymentOrders.map((o) => (
                      <li key={o.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <Link href={`/orden-pago/${o.id}`} className="text-brand-blue-700 hover:underline block truncate">
                            {o.folio} · {formatMXN(o.total)}
                          </Link>
                          <p className="text-xs text-ink-muted truncate">{o.concepto ?? "Todos los conceptos"}</p>
                        </div>
                        <span
                          className={
                            o.estatusPago === "Pagado"
                              ? "text-brand-blue-700"
                              : o.estatusPago === "Cancelada"
                                ? "text-gray-400"
                                : "text-brand-orange-700"
                          }
                        >
                          {o.estatusPago}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          ) : (
          <CostosSyncProvider
            inicial={{
              costoFleteUSA: String(shipment.costoFleteUSA),
              costoImportacion: String(shipment.costoImportacion),
              costoBondCanada: String(shipment.costoBondCanada),
              costoManiobras: String(shipment.costoManiobras),
              costoFleteMx: String(shipment.costoFleteMx),
              costoPermiso: String(shipment.costoPermiso),
              costoSeguro: String(shipment.costoSeguro),
              costoPlacas: String(shipment.costoPlacas),
              costoRepuveTitulo: String(shipment.costoRepuveTitulo),
            }}
          >
          <div className="space-y-6">
            <Card>
              <CardHeader
                title="Costos del embarque"
                subtitle={
                  esServicio
                    ? "Costo real (lo que pagas) vs. precio al cliente (lo que cobras) — la diferencia es tu utilidad"
                    : "Flete USA (viáticos, vuelos, permisos, seguro, placas, gastos generales, reparación, pago operador, etc.) se desglosa arriba por gasto — se suman solos al total. Importación, flete Mx y repuve/título van aquí abajo"
                }
              />
              {!esServicio && (
                <div className="px-5 pt-5 pb-4 border-b border-border">
                  <GastosFleteUSA
                    shipmentId={shipment.id}
                    gastos={shipment.gastosFleteUSA}
                    costoFleteUSA={shipment.costoFleteUSA}
                    soloLectura={false}
                  />
                </div>
              )}
              <form action={updateShipmentCosts.bind(null, shipment.id)} className="p-5 space-y-4">
                {esServicio ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-xs font-medium text-ink-muted px-1">
                      <span>Concepto</span>
                      <span className="w-24 text-right">Costo real</span>
                      <span className="w-24 text-right">Precio cliente</span>
                      <span className="w-20 text-right">Utilidad</span>
                    </div>
                    {[
                      { campo: "costoFleteUSA", precioCampo: "precioFleteUSA", label: "Flete USA", costo: shipment.costoFleteUSA, precio: shipment.precioFleteUSA },
                      { campo: "costoImportacion", precioCampo: "precioImportacion", label: "Importación", costo: shipment.costoImportacion, precio: shipment.precioImportacion },
                      { campo: "costoFleteMx", precioCampo: "precioFleteMx", label: "Flete México", costo: shipment.costoFleteMx, precio: shipment.precioFleteMx },
                      { campo: "costoPermiso", precioCampo: "precioPermiso", label: "Permiso", costo: shipment.costoPermiso, precio: shipment.precioPermiso },
                      { campo: "costoSeguro", precioCampo: "precioSeguro", label: "Seguro", costo: shipment.costoSeguro, precio: shipment.precioSeguro },
                      { campo: "costoPlacas", precioCampo: "precioPlacas", label: "Placas", costo: shipment.costoPlacas, precio: shipment.precioPlacas },
                    ].map((c) => (
                      <div key={c.campo} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                        <span className="text-sm text-ink-secondary">{c.label}</span>
                        <MoneyInput name={c.campo} defaultValue={c.costo} className="w-24 rounded-md border border-border px-2 py-1.5 text-right text-sm" />
                        <MoneyInput name={c.precioCampo} defaultValue={c.precio} className="w-24 rounded-md border border-brand-blue-200 bg-brand-blue-50 px-2 py-1.5 text-right text-sm" />
                        <span className={`w-20 text-right text-sm font-medium ${c.precio - c.costo >= 0 ? "text-brand-blue-700" : "text-red-600"}`}>
                          {formatMXN(c.precio - c.costo)}
                        </span>
                      </div>
                    ))}
                    <input type="hidden" name="costoManiobras" value={shipment.costoManiobras} />
                    <input type="hidden" name="costoRepuveTitulo" value={shipment.costoRepuveTitulo} />
                    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center pt-2 border-t border-border">
                      <span className="text-sm font-semibold text-ink-primary">Total</span>
                      <span className="w-24 text-right text-sm font-semibold text-ink-primary">{formatMXN(totalCostos)}</span>
                      <span className="w-24 text-right text-sm font-semibold text-ink-primary">{formatMXN(totalPrecioServicio)}</span>
                      <span className={`w-20 text-right text-sm font-bold ${utilidadServicio >= 0 ? "text-brand-blue-700" : "text-red-600"}`}>
                        {formatMXN(utilidadServicio)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <SyncedHiddenInput campo="costoFleteUSA" />
                    <SyncedHiddenInput campo="costoPermiso" />
                    <SyncedHiddenInput campo="costoSeguro" />
                    <SyncedHiddenInput campo="costoPlacas" />
                    <div className="flex flex-col gap-2">
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-ink-secondary">Importación</span>
                        <SyncedMoneyInput campo="costoImportacion" />
                      </label>
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="text-ink-muted">Bond/Canadá (solo si cruza de Canadá a USA, si no deja $0)</span>
                        <SyncedMoneyInput campo="costoBondCanada" className="rounded-md border border-border px-2 py-1.5 text-xs" />
                      </label>
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-ink-secondary">Maniobra/Reparación</span>
                        <SyncedMoneyInput campo="costoManiobras" />
                      </label>
                    </div>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-ink-secondary">Flete México</span>
                      <SyncedMoneyInput campo="costoFleteMx" />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-ink-secondary">Repuve/Título</span>
                      <SyncedMoneyInput campo="costoRepuveTitulo" />
                    </label>
                    <label className="flex items-center gap-2 text-sm mt-5">
                      <input type="checkbox" name="fleteMexAplica" defaultChecked={shipment.fleteMexAplica} />
                      <span className="text-ink-secondary">Aplica flete Mx</span>
                    </label>
                    <div className="col-span-2 flex items-center justify-between pt-2 border-t border-border">
                      <span className="text-sm text-ink-secondary">Total</span>
                      <SyncedTotal className="text-lg font-semibold text-ink-primary" />
                    </div>
                    {costoPorMilla !== null && (
                      <div className="col-span-2 flex items-center justify-between text-xs text-ink-muted -mt-2">
                        <span>Costo por milla ({shipment.millas.toLocaleString("es-MX")} mi)</span>
                        <span>{formatMXN(costoPorMilla)} / mi</span>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex justify-end">
                  <SubmitButton pendingText="Guardando…" className="rounded-lg bg-gray-900 text-white text-sm font-medium px-4 py-2 hover:opacity-90">
                    Guardar costos
                  </SubmitButton>
                </div>
              </form>
            </Card>

            <Card>
              <CardHeader
                title="Orden de pago"
                subtitle="Puedes escribir/ajustar el monto aquí mismo: se guarda en el equipo al generar la orden"
              />
              <div className="p-5 space-y-4">
                <form action={generarOrdenDePago.bind(null, shipment.id)} className="space-y-3">
                  <div className="space-y-1.5">
                    {fleteUSAItemizado ? (
                      <>
                        {montosPorSlotFleteUSA.map(({ slot, monto }) => (
                          <label key={slot.key} className="flex items-center justify-between gap-2 text-sm rounded-lg border border-border px-3 py-2">
                            <span className="flex items-center gap-2 text-ink-secondary shrink-0">
                              <input type="checkbox" name={`incluirFleteUSA_${slot.key}`} data-monto={monto} />
                              {slot.label}
                            </span>
                            <span className="w-28 text-right text-sm font-medium text-ink-primary">{formatMXN(monto)}</span>
                          </label>
                        ))}
                      </>
                    ) : (
                      <label className="flex items-center justify-between gap-2 text-sm rounded-lg border border-border px-3 py-2">
                        <span className="flex items-center gap-2 text-ink-secondary shrink-0">
                          <input type="checkbox" name="incluirFleteUSA" />
                          Flete USA
                        </span>
                        <SyncedMoneyInput campo="costoFleteUSA" className="w-28 rounded-md border border-border px-2 py-1 text-right text-sm" />
                      </label>
                    )}
                    {[
                      { check: "incluirImportacion", campo: "costoImportacion", label: "Importación / Aduana", siempre: true },
                      { check: "incluirBondCanada", campo: "costoBondCanada", label: "Bond/Canadá", siempre: false },
                      { check: "incluirManiobras", campo: "costoManiobras", label: "Maniobra/Reparación", siempre: true },
                      { check: "incluirFleteMx", campo: "costoFleteMx", label: "Flete México", siempre: true },
                      { check: "incluirPermiso", campo: "costoPermiso", label: "Permiso", siempre: false },
                      { check: "incluirSeguro", campo: "costoSeguro", label: "Seguro", siempre: false },
                      { check: "incluirPlacas", campo: "costoPlacas", label: "Placas", siempre: false },
                      { check: "incluirRepuveTitulo", campo: "costoRepuveTitulo", label: "Repuve/Título", siempre: true },
                    ]
                      // Permiso/Seguro/Placas/Maniobra ya quedaron dentro de los
                      // conceptos fijos de Flete USA (arriba) — aquí solo se
                      // muestran si una unidad vieja todavía trae algo pendiente
                      // de pagar en esos campos sueltos, para no perderlo.
                      .filter((c) => c.siempre || (shipment[c.campo as keyof typeof shipment] as number) > 0)
                      .map((c) => (
                      <label key={c.check} className="flex items-center justify-between gap-2 text-sm rounded-lg border border-border px-3 py-2">
                        <span className="flex items-center gap-2 text-ink-secondary shrink-0">
                          <input type="checkbox" name={c.check} />
                          {c.label}
                        </span>
                        <SyncedMoneyInput
                          campo={c.campo as CostoCampo}
                          className="w-28 rounded-md border border-border px-2 py-1 text-right text-sm"
                        />
                      </label>
                    ))}
                  </div>
                  <UserSelect name="generadaPor" label="Solicitada por" />

                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-ink-secondary">Tipo de cambio del día (pesos por dólar)</span>
                    <MoneyInput name="tipoCambio" className="rounded-lg border border-border px-3 py-2 text-sm" />
                    <span className="text-xs text-ink-muted">
                      Opcional — si lo llenas, la orden muestra el total también en pesos, para proveedores mexicanos.
                    </span>
                  </label>

                  <div className="pt-2 border-t border-border">
                    <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">
                      A quién se le paga
                    </p>
                    <ProveedorCuentaSelect
                      opciones={opcionesProveedores}
                      ultimaSync={ultimaSyncProveedores}
                      errorSync={estadoProveedores?.ultimoError ?? null}
                      accionActualizar={actualizarCatalogoProveedores}
                    />
                  </div>

                  <input name="notas" placeholder="Notas para administración (opcional)" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
                  <ConfirmZeroCostButton className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-orange-500 hover:bg-brand-orange-600 text-white text-sm font-medium py-2.5">
                    <Printer size={16} />
                    Generar e imprimir orden de pago
                  </ConfirmZeroCostButton>
                </form>

                {shipment.paymentOrders.length > 0 && (
                  <ul className="divide-y divide-border border-t border-border pt-2">
                    {shipment.paymentOrders.map((o) => (
                      <li key={o.id} className="flex items-center justify-between py-2 text-sm gap-2">
                        <div className="min-w-0">
                          <Link href={`/orden-pago/${o.id}`} className="text-brand-blue-700 hover:underline block truncate">
                            {o.folio} · {formatMXN(o.total)}
                          </Link>
                          <p className="text-xs text-ink-muted truncate">{o.concepto ?? "Todos los conceptos"}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={
                              o.estatusPago === "Pagado"
                                ? "text-brand-blue-700"
                                : o.estatusPago === "Cancelada"
                                  ? "text-gray-400"
                                  : "text-brand-orange-700"
                            }
                          >
                            {o.estatusPago}
                          </span>
                          {o.estatusPago === "Pendiente" && (
                            <form action={cancelarOrdenDePago.bind(null, o.id)}>
                              <SubmitButton className="text-xs text-gray-400 hover:text-red-600" title="Cancelar orden (se confirma con el ERP)">
                                Cancelar
                              </SubmitButton>
                            </form>
                          )}
                          {o.estatusPago === "Cancelada" && (
                            <form action={eliminarOrdenDePago.bind(null, o.id)}>
                              <ConfirmSubmitButton
                                confirmText={`¿Eliminar la orden cancelada ${o.folio}? Dejará de mostrarse en la lista.`}
                                className="text-xs text-gray-400 hover:text-red-600"
                                title="Eliminar orden cancelada"
                              >
                                Eliminar
                              </ConfirmSubmitButton>
                            </form>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </div>
          </CostosSyncProvider>
          )}
        </div>

        {/* Documentos — al final: es el último paso, después de generar la orden de pago */}
        <Card>
          <CardHeader title="Documentos" subtitle="Factura, pedimento, BL, etc. — quedan guardados aquí para consultarlos cuando se necesiten" />
          <div className="p-5">
            <DocumentosEmbarque shipmentId={shipment.id} documentos={shipment.archivos} soloLectura={soloLectura} />
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Comentarios */}
          <Card>
            <CardHeader title="Comentarios" />
            {!soloLectura && (
              <form action={createComment} className="p-5 space-y-3 border-b border-border">
                <input type="hidden" name="shipmentId" value={shipment.id} />
                <textarea name="texto" required placeholder="Escribe un comentario…" className="w-full rounded-lg border border-border px-3 py-2 text-sm min-h-16" />
                <div className="flex gap-3">
                  <input name="autor" placeholder="Tu nombre" className="flex-1 rounded-lg border border-border px-3 py-2 text-sm" />
                  <SubmitButton className="rounded-lg bg-gray-900 text-white text-sm font-medium px-4 py-2">Agregar</SubmitButton>
                </div>
              </form>
            )}
            {shipment.comments.length === 0 ? (
              <EmptyState text="Sin comentarios todavía." />
            ) : (
              <ul className="divide-y divide-border">
                {shipment.comments.map((c) => (
                  <li key={c.id} className="px-5 py-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-ink-primary">{c.texto}</p>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {c.autor ?? "Sin autor"} · {formatFecha(c.createdAt)} {c.tipo === "recordatorio" && "· Recordatorio"}
                      </p>
                    </div>
                    {!soloLectura && !c.resuelto && c.tipo === "recordatorio" && (
                      <form action={resolveComment.bind(null, c.id)}>
                        <SubmitButton className="text-xs text-brand-blue-700 hover:underline shrink-0">Resolver</SubmitButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Historial de estatus */}
          <Card>
            <CardHeader title="Historial de estatus" subtitle={soloLectura ? undefined : "Puedes editar fechas o agregar etapas pasadas que no se registraron a tiempo"} />
            <HistorialEstatusEditable
              shipmentId={shipment.id}
              eventos={shipment.statusEvents}
              duracionPorEvento={Object.fromEntries(duracionPorEvento)}
              soloLectura={soloLectura}
            />
          </Card>
        </div>
      </main>
    </>
  );
}
