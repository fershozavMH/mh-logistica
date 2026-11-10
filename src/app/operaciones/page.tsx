import FotoMini from "@/components/FotoMini";
import { fotoSrc } from "@/lib/foto-url";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { Card, EmptyState, StatusBadge, SerieTag, ClockBadge } from "@/components/ui";
import Buscador from "@/components/Buscador";
import { getShipmentsBoard } from "@/lib/queries";
import { ESTATUS_FLOW, formatFecha, coincideBusqueda } from "@/lib/constants";

export const dynamic = "force-dynamic";

// El tablero llegó a pesar casi 900 KB porque dibujaba TODAS las unidades,
// y la columna "Entregado" crece sin parar. Ahora muestra solo las últimas
// entregadas; las anteriores se ven con "Ver todas" o con el buscador.
const ENTREGADAS_RECIENTES = 12;
const MAX_FILTRADAS = 40;

export default async function OperacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ estatus?: string; buscar?: string }>;
}) {
  const { estatus: filtro, buscar } = await searchParams;
  const todos = await getShipmentsBoard();
  const coinciden = buscar
    ? todos.filter((s) => coincideBusqueda(buscar, [s.equipoDescripcion, s.cliente, s.serie, s.folio]))
    : todos;

  // Entregadas: las más recientes primero. Sin filtro ni búsqueda solo se
  // dibujan las últimas; con filtro o búsqueda, hasta MAX_FILTRADAS.
  const completa = !!filtro || !!buscar;
  const tope = completa ? MAX_FILTRADAS : ENTREGADAS_RECIENTES;
  const entregadasTodas = coinciden
    .filter((s) => s.estatus === "Entregado")
    .sort((a, b) => (b.fechaEntrega?.getTime() ?? 0) - (a.fechaEntrega?.getTime() ?? 0));
  const entregadasMostradas = entregadasTodas.slice(0, tope);
  const entregadasOcultas = entregadasTodas.length - entregadasMostradas.length;
  const shipments = [...coinciden.filter((s) => s.estatus !== "Entregado"), ...entregadasMostradas];

  const columnas = filtro
    ? ESTATUS_FLOW.filter((e) => e.key === filtro)
    : ESTATUS_FLOW.filter((e) => e.key !== "Cancelado");

  return (
    <>
      <TopBar title="Operaciones" subtitle="Tablero de estatus en tiempo real" />
      <main className="flex-1 overflow-x-auto overflow-y-hidden p-4 md:p-8">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          {filtro ? (
            <Link href="/operaciones" className="text-sm text-brand-blue-700 hover:underline">
              ← Ver todas las etapas
            </Link>
          ) : (
            <span />
          )}
          <Buscador />
        </div>
        <div className="flex gap-4 h-full min-h-[70vh]">
          {columnas.map((col) => {
            // "Entregado" ya viene ordenada por fecha de entrega (la más
            // reciente arriba); las demás columnas mantienen su orden.
            const items = shipments.filter((s) => s.estatus === col.key);
            return (
              <div key={col.key} className="w-72 shrink-0 flex flex-col">
                <div className={`rounded-t-xl px-4 py-3 ${col.bg}`}>
                  <p className={`text-sm font-semibold ${col.text}`}>{col.label}</p>
                  <p className={`text-xs ${col.text} opacity-80`}>
                    {col.key === "Entregado" ? entregadasTodas.length : items.length} unidad(es)
                  </p>
                </div>
                <Card className="flex-1 rounded-t-none border-t-0 overflow-y-auto p-2 space-y-2">
                  {items.length === 0 ? (
                    <EmptyState text="Sin unidades" />
                  ) : (
                    items.map((s) => (
                      <Link
                        key={s.id}
                        href={`/embarques/${s.id}`}
                        className="flex gap-2.5 rounded-lg border border-border p-3 hover:border-brand-blue-500 hover:shadow-sm transition-all"
                      >
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <FotoMini src={fotoSrc(s, "thumb")} alt="" className="w-16 h-16 rounded-md object-cover border border-border" fallbackClassName="w-16 h-16 rounded-md bg-gray-100" />
                          {s.aduana && (
                            <span className="text-[10px] text-ink-muted text-center leading-tight max-w-16 truncate" title={s.aduana}>
                              {s.aduana}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink-primary line-clamp-2">{s.equipoDescripcion}</p>
                        <p className="text-xs text-ink-muted mt-1">
                          {s.cliente}
                          {s.vendedor && <span> · {s.vendedor}</span>}
                        </p>
                        <div className="flex items-center justify-between mt-1.5">
                          <SerieTag serie={s.serie} />
                          <ClockBadge fechaInicio={s.fechaInicio} fechaEntrega={s.fechaEntrega} tiempoCicloDias={s.tiempoCicloDias} />
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[11px] text-ink-muted">{s.folio}</span>
                          {col.key === "Entregado" ? (
                            s.fechaEntrega && (
                              <span className="text-[11px] font-medium text-brand-navy">
                                Entregado {formatFecha(s.fechaEntrega)}
                              </span>
                            )
                          ) : (
                            s.fechaSalidaProgramada && (
                              <span className="text-[11px] text-brand-orange-700">
                                Sale {formatFecha(s.fechaSalidaProgramada)}
                              </span>
                            )
                          )}
                        </div>
                        </div>
                      </Link>
                    ))
                  )}
                  {col.key === "Entregado" &&
                    entregadasOcultas > 0 &&
                    (completa ? (
                      <p className="px-3 py-2.5 text-center text-xs text-ink-muted">
                        Hay {entregadasOcultas} más antiguas; usa el buscador para encontrarlas.
                      </p>
                    ) : (
                      <Link
                        href="/operaciones?estatus=Entregado"
                        className="block rounded-lg border border-dashed border-border px-3 py-2.5 text-center text-xs text-brand-blue-700 hover:bg-surface-muted"
                      >
                        Ver las {entregadasOcultas} entregadas anteriores
                      </Link>
                    ))}
                </Card>
              </div>
            );
          })}
        </div>

        {/* vista en lista, útil en celular: sin las entregadas, que ya salen
            en su columna y harían la página muy larga */}
        <div className="md:hidden mt-8">
          <p className="text-xs uppercase text-ink-muted mb-2">
            {completa ? "Lista" : "Unidades activas"}
          </p>
          <Card className="divide-y divide-border">
            {(completa ? shipments : shipments.filter((s) => s.estatus !== "Entregado")).map((s) => (
              <Link key={s.id} href={`/embarques/${s.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.equipoDescripcion}</p>
                  <p className="text-xs text-ink-muted truncate flex items-center gap-2">
                    <span>
                      {s.cliente}
                      {s.vendedor && <> · {s.vendedor}</>}
                    </span>
                    <SerieTag serie={s.serie} />
                  </p>
                </div>
                <StatusBadge estatus={s.estatus} />
              </Link>
            ))}
          </Card>
        </div>
      </main>
    </>
  );
}
