import FotoMini from "@/components/FotoMini";
import { fotoSrc } from "@/lib/foto-url";
import { Card, CardHeader, EmptyState, StatusBadge, SerieTag, ClockBadge } from "@/components/ui";
import Buscador from "@/components/Buscador";
import EstatusTimeline from "@/components/EstatusTimeline";
import EntregasHoyBanner from "@/components/EntregasHoyBanner";
import { getReporteDiario } from "@/lib/queries";
import { formatFecha, coincideBusqueda } from "@/lib/constants";
import { calcularTimelineEstatus } from "@/lib/ciclo";
import { analisisMovimientoHoy } from "@/lib/analisis";

export const dynamic = "force-dynamic";

// Vista de solo lectura del estatus de las unidades en operación, pensada
// para Ventas. Desde el 10-nov-2026 pide sesión (proxy.ts): muestra clientes,
// vendedores y notas internas, así que ya no es abierta; a Ventas se le da
// un usuario de Solo lectura. Se conserva la URL para no romper sus links. No usa el layout con menú lateral/login (Sidebar y MobileNav se
// ocultan solos para cualquier ruta que empiece con /publico — ver
// Sidebar.tsx y MobileNav.tsx) y no incluye NADA de costos, pagos ni datos
// bancarios — solo lo mismo que ya se ve en "Equipos en operación" y
// "Comentarios del día" del cierre diario de Reportes, sin botones de editar.
export default async function OperacionPublicaPage({
  searchParams,
}: {
  searchParams: Promise<{ buscar?: string }>;
}) {
  const { buscar } = await searchParams;
  const hoy = new Date();
  const diario = await getReporteDiario(hoy);

  const unidadesFiltradas = buscar
    ? diario.unidadesEnOperacion.filter((s) => coincideBusqueda(buscar, [s.equipoDescripcion, s.cliente, s.serie, s.folio]))
    : diario.unidadesEnOperacion;

  return (
    <>
      <header className="no-print sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-surface/95 backdrop-blur px-4 md:px-8 h-16 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-brand-orange-500 flex items-center justify-center font-bold text-white shrink-0">
            MH
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-ink-primary leading-tight truncate">Estatus de operación</h1>
            <p className="text-xs text-ink-muted capitalize truncate">{formatFecha(hoy)} · Machinery Hunters</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        <EntregasHoyBanner entregas={diario.entregasHoy} hrefFor={(s) => `/publico/unidad/${s.tokenPublico}`} publico />

        <Card>
          <CardHeader
            title="Equipos en operación"
            subtitle={`${diario.unidadesEnOperacion.length} unidad${diario.unidadesEnOperacion.length === 1 ? "" : "es"} activas, de la más reciente a la más antigua`}
            action={<Buscador />}
          />
          {unidadesFiltradas.length === 0 ? (
            <EmptyState text="No hay unidades en operación." />
          ) : (
            <ul className="divide-y divide-border">
              {unidadesFiltradas.map((s) => {
                const comentariosUnidad = s.comments;
                const eventosUnidadHoy = diario.eventos.filter((e) => e.shipmentId === s.id);
                return (
                  <li key={s.id} className="px-5 py-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <FotoMini src={fotoSrc(s, "thumb")} alt="" className="w-11 h-11 rounded-md object-cover shrink-0 border border-border" fallbackClassName="w-11 h-11 rounded-md bg-gray-100 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-ink-primary flex items-center gap-2 flex-wrap">
                            <span>
                              {s.equipoDescripcion} — {s.cliente}
                              {s.vendedor && <span className="text-ink-muted"> ({s.vendedor})</span>}
                            </span>
                            <SerieTag serie={s.serie} />
                          </p>
                          <p className="text-xs text-ink-muted flex items-center gap-2 flex-wrap">
                            <span>{s.folio}</span>
                            {s.aduana && <span>· Aduana: {s.aduana}</span>}
                            <ClockBadge fechaInicio={s.fechaInicio} fechaEntrega={s.fechaEntrega} tiempoCicloDias={s.tiempoCicloDias} />
                          </p>
                        </div>
                      </div>
                      <StatusBadge estatus={s.estatus} />
                    </div>

                    <EstatusTimeline
                      size="compact"
                      steps={calcularTimelineEstatus(s.statusEvents, s.estatus, s.fechaInicio, s.createdAt)}
                    />

                    <p className="text-xs text-ink-secondary italic">
                      {analisisMovimientoHoy(s.estatus, eventosUnidadHoy)}
                    </p>

                    {comentariosUnidad.length > 0 && (
                      <ul className="space-y-1.5">
                        {comentariosUnidad.map((c) => (
                          <li key={c.id} className="text-xs text-ink-secondary bg-surface-muted rounded-lg px-2.5 py-1.5">
                            {c.texto}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Comentarios del día" />
          {diario.comentarios.length === 0 ? (
            <EmptyState text="Sin comentarios hoy." />
          ) : (
            <ul className="divide-y divide-border">
              {diario.comentarios.map((c) => (
                <li key={c.id} className="px-5 py-3">
                  <p className="text-sm text-ink-primary">{c.texto}</p>
                  <p className="text-xs text-ink-muted">
                    {c.autor ?? "Sin autor"} {c.shipment ? `· ${c.shipment.folio}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>
    </>
  );
}
