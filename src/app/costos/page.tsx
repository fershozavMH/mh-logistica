import SubmitButton from "@/components/SubmitButton";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { Card, CardHeader, EmptyState, StatCard, SerieTag, MoneyInput } from "@/components/ui";
import CostosEditableTable from "@/components/CostosEditableTable";
import Buscador from "@/components/Buscador";
import { prisma } from "@/lib/prisma";
import { formatFecha, formatMXN, coincideBusqueda } from "@/lib/constants";
import { after } from "next/server";
import {
  cancelarOrdenDePago,
  eliminarOrdenDePago,
  generarOrdenDePagoGeneral,
  actualizarCatalogoProveedores,
} from "@/lib/actions";
import {
  sincronizarProveedores,
  getOpcionesProveedores,
  getEstadoProveedores,
  reintentarOrdenesNoSincronizadas,
} from "@/lib/erp";
import { esSoloLectura } from "@/lib/auth-server";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import GastoGeneralForm from "@/components/GastoGeneralForm";
import UserSelect from "@/components/UserSelect";
import ProveedorCuentaSelect from "@/components/ProveedorCuentaSelect";
import { AlertTriangle, FileClock, Layers, Printer } from "lucide-react";

export const dynamic = "force-dynamic";

function FiltroPill({
  opciones,
  actual,
  paramName,
  otrosParams,
}: {
  opciones: { valor: string; label: string }[];
  actual: string;
  paramName: string;
  otrosParams?: Record<string, string>;
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {opciones.map((o) => {
        const params = new URLSearchParams({ ...otrosParams, [paramName]: o.valor });
        const activo = actual === o.valor;
        return (
          <Link
            key={o.valor}
            href={`/costos?${params.toString()}#${paramName}`}
            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              activo
                ? "bg-brand-navy text-white border-brand-navy"
                : "border-border text-ink-secondary hover:bg-surface-muted"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}

export default async function CostosPage({
  searchParams,
}: {
  searchParams: Promise<{ ordenes?: string; unidades?: string; buscar?: string }>;
}) {
  const { ordenes: ordenesFiltroRaw, unidades: unidadesFiltroRaw, buscar } = await searchParams;
  const ordenesFiltro = ordenesFiltroRaw ?? "pendientes";
  const unidadesFiltro = unidadesFiltroRaw ?? "pendientes";
  const soloLectura = await esSoloLectura();

  const [shipmentsTodos, ordenesTodas] = await Promise.all([
    prisma.shipment.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { paymentOrders: { where: { eliminadaAt: null } }, gastosFleteUSA: true } } },
    }),
    prisma.paymentOrder.findMany({ where: { eliminadaAt: null }, include: { shipment: true }, orderBy: { fechaGenerada: "desc" } }),
  ]);

  // Órdenes que el ERP no ha confirmado (regla D12): se muestran arriba y se
  // reintentan solas en segundo plano, a lo más cada 5 minutos.
  const noSincronizadas = ordenesTodas.filter((o) => !o.erpEnviado && o.estatusPago === "Pendiente");
  if (!soloLectura && noSincronizadas.length > 0) {
    after(async () => {
      await reintentarOrdenesNoSincronizadas();
    });
  }

  if (!soloLectura) await sincronizarProveedores({ rapido: true });
  const [opcionesProveedores, estadoProveedores] = soloLectura
    ? [[], null]
    : await Promise.all([getOpcionesProveedores(), getEstadoProveedores()]);
  const ultimaSyncProveedores =
    estadoProveedores && estadoProveedores.ultimaVez.getTime() > 0
      ? estadoProveedores.ultimaVez.toLocaleString("es-MX", { timeZone: "America/Hermosillo", dateStyle: "short", timeStyle: "short" })
      : null;

  const activos = shipmentsTodos.filter((s) => s.estatus !== "Entregado");
  const sinCostos = activos.filter(
    (s) => s.costoFleteUSA + s.costoImportacion + s.costoManiobras + s.costoFleteMx + s.costoPermiso + s.costoSeguro + s.costoPlacas === 0
  ).length;
  const sinOrden = activos.filter((s) => s._count.paymentOrders === 0).length;

  const ordenes = ordenesTodas.filter((o) => {
    const camposBusqueda = o.shipment
      ? [o.shipment.equipoDescripcion, o.shipment.cliente, o.shipment.serie, o.shipment.folio]
      : [o.concepto, o.folio, "gasto general", "otros"];
    if (buscar && !coincideBusqueda(buscar, camposBusqueda)) {
      return false;
    }
    if (ordenesFiltro === "todas") return true;
    if (ordenesFiltro === "pagadas") return o.estatusPago === "Pagado";
    if (ordenesFiltro === "canceladas") return o.estatusPago === "Cancelada";
    return o.estatusPago === "Pendiente";
  });

  const shipments = shipmentsTodos.filter((s) => {
    if (buscar && !coincideBusqueda(buscar, [s.equipoDescripcion, s.cliente, s.serie, s.folio])) return false;
    if (unidadesFiltro === "todas") return true;
    if (unidadesFiltro === "entregados") return s.estatus === "Entregado";
    return s.estatus !== "Entregado";
  });

  return (
    <>
      <TopBar title="Costos y pagos" subtitle="Captura de costos por unidad y órdenes de pago" />
      <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        <div className="flex justify-end">
          <Buscador />
        </div>
        {noSincronizadas.length > 0 && (
          <div className="rounded-xl bg-red-50 text-red-700 text-sm px-5 py-3">
            <p className="font-medium">
              {noSincronizadas.length === 1
                ? "1 orden de pago no ha sido confirmada por el ERP"
                : `${noSincronizadas.length} órdenes de pago no han sido confirmadas por el ERP`}
            </p>
            <p className="text-xs mt-1">
              Se reintentan solas cada pocos minutos. Mientras tanto Finanzas no las ve:{" "}
              {noSincronizadas.slice(0, 6).map((o, i) => (
                <span key={o.id}>
                  {i > 0 && ", "}
                  <Link href={`/orden-pago/${o.id}`} className="underline">
                    {o.folio}
                  </Link>
                </span>
              ))}
              {noSincronizadas.length > 6 ? "…" : ""}
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Unidades sin costos capturados"
            value={sinCostos}
            icon={AlertTriangle}
            tone="orange"
            hint="De las que aún no se entregan"
          />
          <StatCard
            label="Unidades sin orden generada"
            value={sinOrden}
            icon={FileClock}
            tone="gray"
            hint="De las que aún no se entregan"
          />
          <StatCard
            label="Órdenes de pago generadas"
            value={ordenesTodas.length}
            icon={Layers}
            tone="blue"
          />
        </div>

        <Card id="ordenes">
          <CardHeader
            title="Órdenes de pago generadas"
            subtitle="Requisiciones enviadas a administración"
            action={
              <FiltroPill
                paramName="ordenes"
                actual={ordenesFiltro}
                otrosParams={{ unidades: unidadesFiltro }}
                opciones={[
                  { valor: "pendientes", label: "Pendientes" },
                  { valor: "pagadas", label: "Pagadas" },
                  { valor: "canceladas", label: "Canceladas" },
                  { valor: "todas", label: "Todas" },
                ]}
              />
            }
          />
          {ordenes.length === 0 ? (
            <EmptyState text="No hay órdenes con este filtro." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-muted border-b border-border">
                    <th className="px-5 py-2.5 font-medium">Folio</th>
                    <th className="px-5 py-2.5 font-medium">Unidad</th>
                    <th className="px-5 py-2.5 font-medium">Concepto</th>
                    <th className="px-5 py-2.5 font-medium">Fecha</th>
                    <th className="px-5 py-2.5 font-medium text-right">Total</th>
                    <th className="px-5 py-2.5 font-medium">Estatus</th>
                    <th className="px-5 py-2.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {ordenes.map((o) => (
                    <tr key={o.id} className="border-b border-border last:border-0 hover:bg-surface-muted">
                      <td className="px-5 py-2.5">
                        <Link href={`/orden-pago/${o.id}`} className="text-brand-blue-700 hover:underline font-medium">
                          {o.folio}
                        </Link>
                      </td>
                      <td className="px-5 py-2.5 text-ink-primary">
                        {o.shipment ? (
                          <>
                            {o.shipment.equipoDescripcion}
                            <div className="mt-0.5">
                              <SerieTag serie={o.shipment.serie} />
                            </div>
                          </>
                        ) : (
                          <span className="text-ink-muted italic">Gasto general (sin unidad)</span>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-ink-secondary">{o.concepto ?? "Todos los conceptos"}</td>
                      <td className="px-5 py-2.5 text-ink-muted">{formatFecha(o.fechaGenerada)}</td>
                      <td className="px-5 py-2.5 text-right font-medium text-ink-primary">{formatMXN(o.total)}</td>
                      <td className="px-5 py-2.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            o.estatusPago === "Pagado"
                              ? "bg-brand-blue-100 text-brand-blue-900"
                              : o.estatusPago === "Cancelada"
                                ? "bg-gray-200 text-gray-500"
                                : "bg-brand-orange-100 text-brand-orange-700"
                          }`}
                        >
                          {o.estatusPago}
                        </span>
                        {!o.erpEnviado && o.estatusPago === "Pendiente" && (
                          <p className="text-xs text-red-600 mt-1">Sin confirmar en ERP</p>
                        )}
                      </td>
                      <td className="px-5 py-2.5">
                        {!soloLectura && (
                          <div className="flex items-center gap-3">
                            {o.estatusPago === "Pendiente" && (
                              <form action={cancelarOrdenDePago.bind(null, o.id)}>
                                <ConfirmSubmitButton
                                  confirmText={`¿Cancelar la orden ${o.folio}? Se cancela también en el ERP.`}
                                  className="text-xs text-gray-400 hover:text-red-600"
                                  title="Cancelar orden (se confirma con el ERP)"
                                >
                                  Cancelar
                                </ConfirmSubmitButton>
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
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {!soloLectura && (
          <Card id="pagos-generales">
            <CardHeader
              title="Pagos generales"
              subtitle="Gastos que no se cargan a ningún equipo en particular — ej. renta, gasolina, gastos varios (concepto 'Otros')"
            />
            <form action={generarOrdenDePagoGeneral} className="p-5 space-y-4">
              <GastoGeneralForm />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-secondary">Concepto / etiqueta</span>
                  <input
                    name="concepto"
                    defaultValue="Otros / Gastos generales"
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  />
                </label>
                <UserSelect name="generadaPor" label="Solicitada por" />
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Tipo de cambio del día (pesos por dólar)</span>
                <MoneyInput name="tipoCambio" className="rounded-lg border border-border px-3 py-2 text-sm" />
                <span className="text-xs text-ink-muted">
                  Opcional — si lo llenas, la orden muestra el total también en pesos.
                </span>
              </label>
              <div className="pt-2 border-t border-border">
                <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">A quién se le paga</p>
                <ProveedorCuentaSelect
                  opciones={opcionesProveedores}
                  ultimaSync={ultimaSyncProveedores}
                  errorSync={estadoProveedores?.ultimoError ?? null}
                  accionActualizar={actualizarCatalogoProveedores}
                />
              </div>
              <input name="notas" placeholder="Notas para administración (opcional)" className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
              <SubmitButton pendingText="Generando orden…" className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-orange-500 hover:bg-brand-orange-600 text-white text-sm font-medium py-2.5">
                <Printer size={16} />
                Generar e imprimir orden de pago
              </SubmitButton>
            </form>
          </Card>
        )}

        <Card id="unidades">
          <CardHeader
            title="Costos por unidad"
            subtitle="Haz clic en el lápiz para editar los costos de una unidad aquí mismo"
            action={
              <FiltroPill
                paramName="unidades"
                actual={unidadesFiltro}
                otrosParams={{ ordenes: ordenesFiltro }}
                opciones={[
                  { valor: "pendientes", label: "Pendientes" },
                  { valor: "entregados", label: "Entregados" },
                  { valor: "todas", label: "Todas" },
                ]}
              />
            }
          />
          {shipments.length === 0 ? (
            <EmptyState text="No hay unidades con este filtro." />
          ) : (
            <CostosEditableTable
              shipments={shipments.map((s) => ({ ...s, tieneGastosFleteUSA: s._count.gastosFleteUSA > 0 }))}
              soloLectura={soloLectura}
            />
          )}
        </Card>
      </main>
    </>
  );
}
