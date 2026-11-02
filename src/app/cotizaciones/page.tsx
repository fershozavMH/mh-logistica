import Link from "next/link";
import { FileText, Clock, CheckCircle2 } from "lucide-react";
import TopBar from "@/components/TopBar";
import { Card, CardHeader, EmptyState, StatCard, MoneyInput } from "@/components/ui";
import SelectOrNew from "@/components/SelectOrNew";
import FotoInputNueva from "@/components/FotoInputNueva";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import Buscador from "@/components/Buscador";
import { crearCotizacion, eliminarCotizacion, aceptarCotizacion, rechazarCotizacion } from "@/lib/actions";
import { getCotizaciones } from "@/lib/queries";
import { esSoloLectura } from "@/lib/auth-server";
import { VENDEDORES, formatMXN, formatFecha, coincideBusqueda } from "@/lib/constants";

export const dynamic = "force-dynamic";

function totalCotizacion(c: {
  costoFleteUSA: number;
  costoImportacion: number;
  costoManiobras: number;
  costoFleteMx: number;
  costoPermiso: number;
  ivaPorcentaje: number;
}) {
  const subtotal = c.costoFleteUSA + c.costoImportacion + c.costoManiobras + c.costoFleteMx + c.costoPermiso;
  return subtotal + subtotal * (c.ivaPorcentaje / 100);
}

function EstatusCotizacion({ estatus }: { estatus: string }) {
  const estilos: Record<string, string> = {
    Pendiente: "bg-brand-orange-100 text-brand-orange-700",
    Aceptada: "bg-green-100 text-green-700",
    Rechazada: "bg-gray-200 text-gray-500",
  };
  return (
    <span className={`inline-block text-xs font-medium rounded-full px-2.5 py-1 ${estilos[estatus] ?? "bg-gray-100 text-gray-700"}`}>
      {estatus}
    </span>
  );
}

export default async function CotizacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ buscar?: string }>;
}) {
  const { buscar } = await searchParams;
  const [cotizacionesTodas, soloLectura] = await Promise.all([getCotizaciones(), esSoloLectura()]);
  const cotizaciones = buscar
    ? cotizacionesTodas.filter((c) => coincideBusqueda(buscar, [c.cliente, c.tipoMaquina, c.folio, c.shipment?.folio]))
    : cotizacionesTodas;
  const pendientes = cotizaciones.filter((c) => c.estatus === "Pendiente").length;
  const aceptadas = cotizaciones.filter((c) => c.estatus === "Aceptada").length;

  return (
    <>
      <TopBar title="Cotizaciones" subtitle="Genera cotizaciones para clientes y da seguimiento" />
      <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Cotizaciones totales" value={cotizaciones.length} icon={FileText} tone="blue" />
          <StatCard label="Pendientes" value={pendientes} icon={Clock} tone="orange" />
          <StatCard label="Aceptadas" value={aceptadas} icon={CheckCircle2} tone="navy" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {!soloLectura && (
          <Card className="lg:col-span-1">
            <CardHeader title="Nueva cotización" subtitle="Se genera lista para imprimir o mandar en PDF" />
            <form action={crearCotizacion} className="p-5 space-y-3">
              <FotoInputNueva />

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Cliente</span>
                <input name="cliente" required className="rounded-lg border border-border px-3 py-2 text-sm" />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-secondary">Tipo de máquina</span>
                  <input
                    name="tipoMaquina"
                    required
                    placeholder="Ej. Retroexcavadora"
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-secondary">Año</span>
                  <input name="anio" placeholder="Ej. 2014" className="rounded-lg border border-border px-3 py-2 text-sm" />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-secondary">Ubicación de origen</span>
                  <input name="origenCiudad" className="rounded-lg border border-border px-3 py-2 text-sm" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-secondary">Ubicación de destino</span>
                  <input name="destinoCiudad" className="rounded-lg border border-border px-3 py-2 text-sm" />
                </label>
              </div>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Quién la manda</span>
                <SelectOrNew name="vendedor" options={VENDEDORES} placeholder="Nombre de quien la envía" />
              </label>

              <div className="pt-2 border-t border-border space-y-2">
                <p className="text-xs font-medium text-ink-muted px-0.5">Desglose de costos (USD)</p>
                {[
                  { key: "costoFleteUSA", label: "Flete USA" },
                  { key: "costoImportacion", label: "Importación" },
                  { key: "costoManiobras", label: "Maniobras" },
                  { key: "costoFleteMx", label: "Flete México" },
                  { key: "costoPermiso", label: "Permiso/Seguro/Placas" },
                ].map((c) => (
                  <div key={c.key} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                    <span className="text-sm text-ink-secondary">{c.label}</span>
                    <MoneyInput name={c.key} className="w-24 rounded-md border border-border px-2 py-1.5 text-right text-sm" />
                  </div>
                ))}
                <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                  <span className="text-sm text-ink-secondary">IVA (%)</span>
                  <input
                    name="ivaPorcentaje"
                    placeholder="0"
                    inputMode="decimal"
                    className="w-24 rounded-md border border-border px-2 py-1.5 text-right text-sm"
                  />
                </div>
              </div>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Comentarios (opcional)</span>
                <textarea
                  name="notas"
                  rows={3}
                  placeholder="Se muestran en la cotización"
                  className="rounded-lg border border-border px-3 py-2 text-sm resize-none"
                />
              </label>

              <button className="w-full rounded-lg bg-brand-blue-600 hover:bg-brand-blue-700 text-white text-sm font-medium py-2.5 mt-2">
                Generar cotización
              </button>
            </form>
          </Card>
          )}

          <Card className={soloLectura ? "lg:col-span-3" : "lg:col-span-2"}>
            <CardHeader title="Historial de cotizaciones" action={<Buscador />} />
            {cotizaciones.length === 0 ? (
              <EmptyState text="Todavía no se ha generado ninguna cotización." />
            ) : (
              <ul className="divide-y divide-border">
                {cotizaciones.map((c) => (
                  <li key={c.id} className="px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <Link href={`/cotizaciones/${c.id}`} className="text-sm font-medium text-ink-primary hover:text-brand-blue-700">
                        {c.folio} · {c.tipoMaquina} {c.anio}
                      </Link>
                      <p className="text-xs text-ink-muted">
                        {c.cliente} · {formatFecha(c.fecha)}
                        {c.vendedor && ` · ${c.vendedor}`}
                      </p>
                      {c.shipment && (
                        <Link href={`/embarques/${c.shipment.id}`} className="text-xs text-brand-blue-700 hover:underline">
                          Ver unidad {c.shipment.folio} →
                        </Link>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-semibold text-ink-primary">{formatMXN(totalCotizacion(c))}</span>
                      <EstatusCotizacion estatus={c.estatus} />
                      {!soloLectura && (
                        <>
                          {c.estatus === "Pendiente" && (
                            <>
                              <form action={aceptarCotizacion.bind(null, c.id)}>
                                <button className="text-xs text-green-700 hover:underline">Aceptada</button>
                              </form>
                              <form action={rechazarCotizacion.bind(null, c.id)}>
                                <button className="text-xs text-ink-muted hover:text-red-600 hover:underline">Rechazada</button>
                              </form>
                            </>
                          )}
                          <form action={eliminarCotizacion.bind(null, c.id)}>
                            <ConfirmSubmitButton
                              confirmText={`¿Eliminar la cotización ${c.folio}? Esto no se puede deshacer.`}
                              className="text-xs text-ink-muted hover:text-red-600 hover:underline"
                            >
                              Eliminar
                            </ConfirmSubmitButton>
                          </form>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </main>
    </>
  );
}
