import SubmitButton from "@/components/SubmitButton";
import FotoMini from "@/components/FotoMini";
import { fotoSrc } from "@/lib/foto-url";
import Link from "next/link";
import { Truck, PackageCheck, Bell, AlertCircle, CheckCircle2, Ship, Landmark, Wrench, Signpost, IdCard } from "lucide-react";
import TopBar from "@/components/TopBar";
import { Card, CardHeader, EmptyState, StatCard, StatusBadge, SerieTag, ClockBadge } from "@/components/ui";
import { getDashboardData, getAgendaHoy } from "@/lib/queries";
import { getEventosCalendarioJaimeHoy, getEventosCalendarioRaulHoy, type EventoCalendario } from "@/lib/calendario";
import { formatMXN, formatHora } from "@/lib/constants";
import { createComment, resolveComment } from "@/lib/actions";
import { ESTATUS_FLOW } from "@/lib/constants";
import { esSoloLectura } from "@/lib/auth-server";
import { CalendarClock, CalendarDays } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [data, agenda, eventosGoogleJaime, eventosGoogleRaul, soloLectura] = await Promise.all([
    getDashboardData(),
    getAgendaHoy(),
    getEventosCalendarioJaimeHoy(),
    getEventosCalendarioRaulHoy(),
    esSoloLectura(),
  ]);
  const hoyTexto = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());

  type ItemAgenda =
    | { tipo: "manual"; id: string; hora: Date; texto: string }
    | { tipo: "google"; id: string; hora: Date; texto: string };

  function combinarAgenda(manual: typeof agenda.jaime, google: EventoCalendario[]): ItemAgenda[] {
    const items: ItemAgenda[] = [
      ...manual.map((r) => ({ tipo: "manual" as const, id: String(r.id), hora: new Date(r.fechaRecordatorio!), texto: r.texto })),
      ...google.map((e) => ({ tipo: "google" as const, id: e.id, hora: e.inicio, texto: e.titulo })),
    ];
    return items.sort((a, b) => a.hora.getTime() - b.hora.getTime());
  }

  const columnas = [
    { nombre: "Jaime Zamudio", items: combinarAgenda(agenda.jaime, eventosGoogleJaime) },
    { nombre: "Raúl Favela", items: combinarAgenda(agenda.raul, eventosGoogleRaul) },
  ];

  return (
    <>
      <TopBar title="Panel principal" />
      <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        {/* Agenda de hoy: Jaime a la izquierda, Raúl a la derecha */}
        <Card>
          <CardHeader title="Agenda de hoy" subtitle={`Reuniones y pendientes de agenda · ${hoyTexto}`} />
          {!soloLectura && (
            <form action={createComment} className="p-5 border-b border-border grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2">
              <input type="hidden" name="tipo" value="reunion" />
              <input
                name="texto"
                required
                placeholder="Asunto de la reunión"
                className="rounded-lg border border-border px-3 py-2 text-sm"
              />
              <input
                type="datetime-local"
                name="fechaRecordatorio"
                required
                defaultValue={new Date().toISOString().slice(0, 16)}
                className="rounded-lg border border-border px-3 py-2 text-sm"
              />
              <select name="autor" required defaultValue="" className="rounded-lg border border-border px-3 py-2 text-sm">
                <option value="" disabled>
                  ¿Quién?
                </option>
                <option value="Jaime Zamudio">Jaime Zamudio</option>
                <option value="Raúl Favela">Raúl Favela</option>
              </select>
              <SubmitButton className="rounded-lg bg-brand-navy text-white text-sm font-medium px-4 py-2 hover:opacity-90 flex items-center justify-center gap-1.5">
                <CalendarClock size={14} />
                Agregar
              </SubmitButton>
            </form>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
            {columnas.map((col) => (
              <div key={col.nombre} className="p-5">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">{col.nombre}</p>
                {col.items.length === 0 ? (
                  <p className="text-sm text-ink-muted">Sin reuniones agendadas hoy.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {col.items.map((item) => (
                      <li key={item.id} className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <span className="text-sm font-semibold text-brand-blue-700 shrink-0 w-12">
                            {formatHora(item.hora)}
                          </span>
                          {item.tipo === "google" && (
                            <CalendarDays size={14} className="text-ink-muted shrink-0 mt-0.5" />
                          )}
                          <span className="text-sm text-ink-primary">{item.texto}</span>
                        </div>
                        {!soloLectura && item.tipo === "manual" && (
                          <form action={resolveComment.bind(null, item.id)}>
                            <SubmitButton className="text-xs text-ink-muted hover:text-brand-blue-700 shrink-0">Listo</SubmitButton>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Recordatorios de salidas de hoy */}
        {(data.salidasHoy.length > 0 || data.recordatoriosHoy.length > 0) && (
          <Card className="border-brand-orange-500/40 bg-brand-orange-50">
            <div className="flex items-start gap-3 p-5">
              <div className="h-9 w-9 rounded-lg bg-brand-orange-500 text-white flex items-center justify-center shrink-0">
                <Bell size={18} />
              </div>
              <div className="flex-1 space-y-2">
                <p className="font-semibold text-brand-orange-700 text-sm">Para hoy</p>
                {data.salidasHoy.map((s) => (
                  <Link
                    key={s.id}
                    href={`/embarques/${s.id}`}
                    className="flex items-center gap-2 text-sm text-ink-primary hover:underline"
                  >
                    <span>
                      🚚 Sale hoy: <span className="font-medium">{s.equipoDescripcion}</span> — {s.cliente}
                    </span>
                    <SerieTag serie={s.serie} />
                  </Link>
                ))}
                {data.recordatoriosHoy.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 text-sm text-ink-primary">
                    <span>
                      🔔 {r.texto}
                      {r.shipment && (
                        <>
                          {" "}
                          —{" "}
                          <Link href={`/embarques/${r.shipment.id}`} className="underline">
                            {r.shipment.folio}
                          </Link>
                        </>
                      )}
                    </span>
                    {!soloLectura && (
                      <form action={resolveComment.bind(null, r.id)}>
                        <SubmitButton className="text-xs text-brand-orange-700 hover:underline shrink-0">Listo</SubmitButton>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Semáforos: Agencia (rojo, en reparación o falta de pago), Listo para
            entregar (amarillo, detenido por logística o pago, sin falla) y
            Flete México (verde, en camino a destino) */}
        {(data.enAgencia.length > 0 || data.enListoParaEntregar.length > 0 || data.enFleteMexico.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {data.enAgencia.length > 0 && (
              <Card className="border-2 border-red-500/60">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                  <span className="relative flex h-3.5 w-3.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-600" />
                  </span>
                  <div>
                    <p className="font-semibold text-red-700 text-sm">En Agencia — en reparación</p>
                    <p className="text-xs text-ink-muted">
                      Ya casi se entregan, pero están detenidas en reparación. {data.enAgencia.length} unidad
                      {data.enAgencia.length === 1 ? "" : "es"}.
                    </p>
                  </div>
                </div>
                <ul className="divide-y divide-border">
                  {data.enAgencia.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/embarques/${s.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-red-50/60 transition-colors"
                      >
                        <div className="min-w-0 flex items-center gap-2 flex-wrap">
                          <Wrench size={14} className="text-red-600 shrink-0" />
                          <span className="text-sm font-medium text-ink-primary truncate">{s.equipoDescripcion}</span>
                          <span className="text-xs text-ink-muted">{s.cliente}</span>
                          <SerieTag serie={s.serie} />
                        </div>
                        <ClockBadge fechaInicio={s.fechaInicio} fechaEntrega={s.fechaEntrega} tiempoCicloDias={s.tiempoCicloDias} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {data.enListoParaEntregar.length > 0 && (
              <Card className="border-2 border-yellow-500/60">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                  <span className="relative flex h-3.5 w-3.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-yellow-600" />
                  </span>
                  <div>
                    <p className="font-semibold text-yellow-700 text-sm">Listo para entregar</p>
                    <p className="text-xs text-ink-muted">
                      Ya resuelto en agencia, pero detenido por logística o pago (no por reparación). {data.enListoParaEntregar.length} unidad
                      {data.enListoParaEntregar.length === 1 ? "" : "es"}.
                    </p>
                  </div>
                </div>
                <ul className="divide-y divide-border">
                  {data.enListoParaEntregar.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/embarques/${s.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-yellow-50/60 transition-colors"
                      >
                        <div className="min-w-0 flex items-center gap-2 flex-wrap">
                          <PackageCheck size={14} className="text-yellow-600 shrink-0" />
                          <span className="text-sm font-medium text-ink-primary truncate">{s.equipoDescripcion}</span>
                          <span className="text-xs text-ink-muted">{s.cliente}</span>
                          <SerieTag serie={s.serie} />
                        </div>
                        <ClockBadge fechaInicio={s.fechaInicio} fechaEntrega={s.fechaEntrega} tiempoCicloDias={s.tiempoCicloDias} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {data.enFleteMexico.length > 0 && (
              <Card className="border-2 border-green-500/60">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                  <span className="relative flex h-3.5 w-3.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-green-600" />
                  </span>
                  <div>
                    <p className="font-semibold text-green-700 text-sm">Flete México — en camino</p>
                    <p className="text-xs text-ink-muted">
                      Ya cruzaron, van rumbo a destino dentro de México. {data.enFleteMexico.length} unidad
                      {data.enFleteMexico.length === 1 ? "" : "es"}.
                    </p>
                  </div>
                </div>
                <ul className="divide-y divide-border">
                  {data.enFleteMexico.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/embarques/${s.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-green-50/60 transition-colors"
                      >
                        <div className="min-w-0 flex items-center gap-2 flex-wrap">
                          <Ship size={14} className="text-green-600 shrink-0" />
                          <span className="text-sm font-medium text-ink-primary truncate">{s.equipoDescripcion}</span>
                          <span className="text-xs text-ink-muted">{s.cliente}</span>
                          <SerieTag serie={s.serie} />
                          {s.destinoCiudad && (
                            <span className="text-xs text-ink-muted">→ {s.destinoCiudad}</span>
                          )}
                        </div>
                        <ClockBadge fechaInicio={s.fechaInicio} fechaEntrega={s.fechaEntrega} tiempoCicloDias={s.tiempoCicloDias} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Unidades en operación" value={data.totalActivos} icon={Truck} tone="blue" />
          <StatCard label="Entregadas este mes" value={data.totalEntregadosMes} icon={PackageCheck} tone="navy" />
          <StatCard
            label="Total unidades entregadas"
            value={data.porEstatus["Entregado"] ?? 0}
            icon={CheckCircle2}
            tone="orange"
          />
          <StatCard label="Pendientes por atender" value={data.comentariosAbiertos.length} icon={AlertCircle} tone="gray" />
        </div>

        {/* Costos por concepto, solo de lo que aún no se entrega */}
        <Card>
          <CardHeader
            title="Costos por concepto"
            subtitle="Solo de las operaciones que todavía no se han entregado"
          />
          <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Flete USA", value: data.costosPorConcepto.fleteUSA, icon: Truck },
              { label: "Importación", value: data.costosPorConcepto.importacion, icon: Landmark },
              { label: "Maniobra/Reparación", value: data.costosPorConcepto.maniobras, icon: Wrench },
              { label: "Flete México", value: data.costosPorConcepto.fleteMx, icon: Ship },
              { label: "Permiso", value: data.costosPorConcepto.permiso, icon: Signpost },
              { label: "Seguro", value: data.costosPorConcepto.seguro, icon: Signpost },
              { label: "Placas", value: data.costosPorConcepto.placas, icon: Signpost },
              { label: "Repuve/Título", value: data.costosPorConcepto.repuveTitulo, icon: IdCard },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border border-border p-3">
                <c.icon size={16} className="text-brand-blue-600 mb-1.5" />
                <p className="text-lg font-semibold text-ink-primary">{formatMXN(c.value)}</p>
                <p className="text-xs text-ink-muted mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tablero por estatus */}
          <Card className={soloLectura ? "lg:col-span-3" : "lg:col-span-2"}>
            <CardHeader title="Operaciones por etapa" subtitle="Estatus en tiempo real de todas las unidades" />
            <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {ESTATUS_FLOW.filter((e) => e.key !== "Cancelado").map((e) => (
                <Link
                  key={e.key}
                  href={`/operaciones?estatus=${encodeURIComponent(e.key)}`}
                  className={`rounded-lg p-3 ${e.bg} hover:opacity-90 transition-opacity`}
                >
                  <p className={`text-2xl font-semibold ${e.text}`}>{data.porEstatus[e.key] ?? 0}</p>
                  <p className={`text-xs mt-1 ${e.text} opacity-90`}>{e.label}</p>
                </Link>
              ))}
            </div>
          </Card>

          {/* Recordatorio rápido */}
          {!soloLectura && (
            <Card>
              <CardHeader title="Agregar recordatorio" subtitle="Para el dashboard de hoy" />
              <form action={createComment} className="p-5 space-y-3">
                <input type="hidden" name="tipo" value="recordatorio" />
                <textarea
                  name="texto"
                  required
                  placeholder="Ej. Confirmar cruce de la grúa 1783 en Calexico"
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm min-h-20"
                />
                <input
                  type="datetime-local"
                  name="fechaRecordatorio"
                  defaultValue={new Date().toISOString().slice(0, 16)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                />
                <input
                  name="autor"
                  placeholder="Tu nombre"
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                />
                <SubmitButton pendingText="Guardando…" className="w-full rounded-lg bg-brand-navy text-white text-sm font-medium py-2 hover:opacity-90">
                  Guardar recordatorio
                </SubmitButton>
              </form>
            </Card>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Actividad reciente */}
          <Card>
            <CardHeader title="Actividad reciente" subtitle="Últimos movimientos registrados" />
            {data.recientes.length === 0 ? (
              <EmptyState text="Aún no hay unidades registradas." />
            ) : (
              <ul className="divide-y divide-border">
                {data.recientes.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/embarques/${s.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-muted transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FotoMini src={fotoSrc(s, "thumb")} alt="" className="w-9 h-9 rounded-md object-cover shrink-0 border border-border" fallbackClassName="w-9 h-9 rounded-md bg-gray-100 shrink-0" />
                        <div className="min-w-0">
                        <p className="text-sm font-medium text-ink-primary truncate">{s.equipoDescripcion}</p>
                        <p className="text-xs text-ink-muted truncate flex items-center gap-2 flex-wrap">
                          <span>{s.cliente} · {s.folio}</span>
                          <SerieTag serie={s.serie} />
                          <ClockBadge fechaInicio={s.fechaInicio} fechaEntrega={s.fechaEntrega} tiempoCicloDias={s.tiempoCicloDias} />
                        </p>
                        </div>
                      </div>
                      <StatusBadge estatus={s.estatus} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Pendientes por atender */}
          <Card>
            <CardHeader title="Pendientes por atender" subtitle="Comentarios y recordatorios sin resolver" />
            {data.comentariosAbiertos.length === 0 ? (
              <div className="p-5 flex items-center gap-2 text-sm text-ink-muted">
                <CheckCircle2 size={16} className="text-brand-blue-600" />
                Todo al día, no hay pendientes.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {data.comentariosAbiertos.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ink-primary truncate">{c.texto}</p>
                      <p className="text-xs text-ink-muted truncate">
                        {c.autor ?? "Sin autor"} {c.shipment ? `· ${c.shipment.folio}` : ""}
                      </p>
                    </div>
                    {!soloLectura && (
                      <form action={resolveComment.bind(null, c.id)}>
                        <SubmitButton className="text-xs text-brand-blue-700 hover:underline shrink-0">Resolver</SubmitButton>
                      </form>
                    )}
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
