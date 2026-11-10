import FotoMini from "@/components/FotoMini";
import { fotoSrc } from "@/lib/foto-url";
import Link from "next/link";
import { Truck, Landmark, Wrench, Ship, Signpost, IdCard, X, MonitorPlay } from "lucide-react";
import TopBar from "@/components/TopBar";
import { Card, CardHeader, EmptyState, StatusBadge, SerieTag, ClockBadge } from "@/components/ui";
import PrintButton from "@/components/PrintButton";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import Buscador from "@/components/Buscador";
import EstatusTimeline from "@/components/EstatusTimeline";
import EntregasHoyBanner from "@/components/EntregasHoyBanner";
import CopyLinkButton from "@/components/CopyLinkButton";
import IndiceComplejidadCard from "@/components/IndiceComplejidadCard";
import TiempoPorEtapaCard from "@/components/TiempoPorEtapaCard";
import { getReporteDiario, getReporteRango } from "@/lib/queries";
import { formatFecha, formatMXN, coincideBusqueda } from "@/lib/constants";
import { calcularTimelineEstatus } from "@/lib/ciclo";
import { analisisMovimientoHoy } from "@/lib/analisis";
import { createComment, updateComment, deleteComment } from "@/lib/actions";
import { esSoloLectura } from "@/lib/auth-server";

const MAX_COMENTARIOS_POR_UNIDAD = 3;

function CostosPorConcepto({
  costos,
  fuente = "ordenes",
}: {
  costos: { fleteUSA: number; importacion: number; maniobras: number; fleteMx: number; permiso: number; seguro: number; placas: number; repuveTitulo: number };
  fuente?: "ordenes" | "entregas";
}) {
  const total =
    costos.fleteUSA + costos.importacion + costos.maniobras + costos.fleteMx + costos.permiso + costos.seguro + costos.placas + costos.repuveTitulo;
  const conceptos = [
    { label: "Flete USA", value: costos.fleteUSA, icon: Truck },
    { label: "Importación / Aduana", value: costos.importacion, icon: Landmark },
    { label: "Maniobra/Reparación", value: costos.maniobras, icon: Wrench },
    { label: "Flete México", value: costos.fleteMx, icon: Ship },
    { label: "Permiso", value: costos.permiso, icon: Signpost },
    { label: "Seguro", value: costos.seguro, icon: Signpost },
    { label: "Placas", value: costos.placas, icon: Signpost },
    { label: "Repuve/Título", value: costos.repuveTitulo, icon: IdCard },
  ];
  return (
    <Card>
      <CardHeader
        title="Costo por concepto"
        subtitle={
          fuente === "ordenes"
            ? "De las órdenes de pago generadas en este periodo"
            : "De las unidades entregadas en este periodo (no hay órdenes de pago capturadas en la app para este periodo)"
        }
      />
      <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {conceptos.map((c) => (
          <div key={c.label} className="rounded-lg border border-border p-3">
            <c.icon size={16} className="text-brand-blue-600 mb-1.5" />
            <p className="text-lg font-semibold text-ink-primary">{formatMXN(c.value)}</p>
            <p className="text-xs text-ink-muted mt-0.5">{c.label}</p>
          </div>
        ))}
        <div className="rounded-lg border border-brand-navy bg-brand-navy/5 p-3">
          <p className="text-lg font-semibold text-ink-primary">{formatMXN(total)}</p>
          <p className="text-xs text-ink-muted mt-0.5">Total</p>
        </div>
      </div>
    </Card>
  );
}

function TablaProveedor({
  titulo,
  filas,
}: {
  titulo: string;
  filas: { proveedor: string; monto: number; n: number; pct: number }[];
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">{titulo}</p>
      {filas.length === 0 ? (
        <p className="text-sm text-ink-muted">Sin movimientos en este periodo.</p>
      ) : (
        <div className="space-y-2.5">
          {filas.map((f) => (
            <div key={f.proveedor}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-ink-primary truncate">
                  {f.proveedor} <span className="text-ink-muted">({f.n} servicio{f.n === 1 ? "" : "s"})</span>
                </span>
                <span className="text-ink-muted shrink-0 ml-2">
                  {formatMXN(f.monto)} · {f.pct}%
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
                <div className="h-full rounded-full bg-brand-blue-500" style={{ width: `${f.pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PagosPorProveedor({
  proveedoresFleteUSA,
  proveedoresAgenteAduanal,
}: {
  proveedoresFleteUSA: { proveedor: string; monto: number; n: number; pct: number }[];
  proveedoresAgenteAduanal: { proveedor: string; monto: number; n: number; pct: number }[];
}) {
  return (
    <Card>
      <CardHeader
        title="Pagos por proveedor"
        subtitle="% del trabajo (en dinero) que le damos a cada quien, de las unidades entregadas en este periodo"
      />
      <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
        <TablaProveedor titulo="Flete USA" filas={proveedoresFleteUSA} />
        <TablaProveedor titulo="Importación / Agente aduanal" filas={proveedoresAgenteAduanal} />
      </div>
      <p className="px-5 pb-4 text-xs text-ink-muted">
        Flete México y Maniobras/Permiso todavía no tienen un campo de proveedor capturado en el sistema, por eso no
        aparecen aquí desglosados.
      </p>
    </Card>
  );
}

function CostoPromedio({
  costos,
}: {
  costos: { fleteUSA: number; importacion: number; maniobras: number; fleteMx: number; permiso: number; seguro: number; placas: number; repuveTitulo: number };
}) {
  const conceptos = [
    { label: "Flete USA", value: costos.fleteUSA, icon: Truck },
    { label: "Importación / Aduana", value: costos.importacion, icon: Landmark },
    { label: "Maniobra/Reparación", value: costos.maniobras, icon: Wrench },
    { label: "Flete México", value: costos.fleteMx, icon: Ship },
    { label: "Permiso", value: costos.permiso, icon: Signpost },
    { label: "Seguro", value: costos.seguro, icon: Signpost },
    { label: "Placas", value: costos.placas, icon: Signpost },
    { label: "Repuve/Título", value: costos.repuveTitulo, icon: IdCard },
  ];
  return (
    <Card>
      <CardHeader title="Costo promedio por unidad" subtitle="Promedio de las unidades entregadas este mes, por concepto" />
      <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {conceptos.map((c) => (
          <div key={c.label} className="rounded-lg border border-border p-3">
            <c.icon size={16} className="text-brand-blue-600 mb-1.5" />
            <p className="text-lg font-semibold text-ink-primary">{formatMXN(c.value)}</p>
            <p className="text-xs text-ink-muted mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CostosPorCategoria({
  filas,
}: {
  filas: {
    categoria: string;
    n: number;
    fleteUSA: { promedio: number; n: number };
    importacion: { promedio: number; n: number };
    fleteMx: { promedio: number; n: number };
    maniobras: { promedio: number; n: number };
    costoTotalPromedio: number;
  }[];
}) {
  return (
    <Card>
      <CardHeader
        title="Costo promedio por categoría de equipo"
        subtitle="Flete USA, Importación, Flete México y Maniobra/Reparación promedio, de las unidades entregadas este mes"
      />
      {filas.length === 0 ? (
        <EmptyState text="Sin unidades entregadas con categoría este mes." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted border-b border-border">
                <th className="px-5 py-2.5 font-medium">Categoría</th>
                <th className="px-5 py-2.5 font-medium text-right">Unidades</th>
                <th className="px-5 py-2.5 font-medium text-right">Flete USA prom.</th>
                <th className="px-5 py-2.5 font-medium text-right">Importación prom.</th>
                <th className="px-5 py-2.5 font-medium text-right">Flete Mx prom.</th>
                <th className="px-5 py-2.5 font-medium text-right">Maniobra prom.</th>
                <th className="px-5 py-2.5 font-medium text-right">Costo total prom.</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((c) => (
                <tr key={c.categoria} className="border-b border-border last:border-0 hover:bg-surface-muted">
                  <td className="px-5 py-2.5 font-medium text-ink-primary">{c.categoria}</td>
                  <td className="px-5 py-2.5 text-right">{c.n}</td>
                  <td className="px-5 py-2.5 text-right">{c.fleteUSA.n > 0 ? formatMXN(c.fleteUSA.promedio) : "—"}</td>
                  <td className="px-5 py-2.5 text-right">{c.importacion.n > 0 ? formatMXN(c.importacion.promedio) : "—"}</td>
                  <td className="px-5 py-2.5 text-right">{c.fleteMx.n > 0 ? formatMXN(c.fleteMx.promedio) : "—"}</td>
                  <td className="px-5 py-2.5 text-right">{c.maniobras.n > 0 ? formatMXN(c.maniobras.promedio) : "—"}</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-ink-primary">
                    {c.costoTotalPromedio > 0 ? formatMXN(c.costoTotalPromedio) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TiempoPorCategoria({
  filas,
}: {
  filas: {
    categoria: string;
    n: number;
    cicloPromedioDias: number | null;
    diasEnAgenciaPromedio: number | null;
  }[];
}) {
  return (
    <Card>
      <CardHeader
        title="Tiempo de ciclo promedio por categoría de equipo"
        subtitle="Cuánto tardaron en cruzar (compra → listo para entregar, sin contar Agencia), de las unidades entregadas este mes"
      />
      {filas.length === 0 ? (
        <EmptyState text="Sin unidades entregadas con categoría este mes." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-muted border-b border-border">
                <th className="px-5 py-2.5 font-medium">Categoría</th>
                <th className="px-5 py-2.5 font-medium text-right">Unidades</th>
                <th className="px-5 py-2.5 font-medium text-right">Ciclo promedio</th>
                <th className="px-5 py-2.5 font-medium text-right">Días en Agencia prom.</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((c) => (
                <tr key={c.categoria} className="border-b border-border last:border-0 hover:bg-surface-muted">
                  <td className="px-5 py-2.5 font-medium text-ink-primary">{c.categoria}</td>
                  <td className="px-5 py-2.5 text-right">{c.n}</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-ink-primary">
                    {c.cicloPromedioDias != null ? `${c.cicloPromedioDias} días` : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {c.diasEnAgenciaPromedio != null ? `${c.diasEnAgenciaPromedio} días` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function analisisCiclo(etapasPromedio: { estatus: string; promedioDias: number; n: number }[]) {
  // "Agencia" se queda aparte del ciclo logístico (ver arriba) — se excluye
  // de este análisis porque ya tiene su propio dato (Promedio en Agencia).
  // No se calcula "% del ciclo" aquí: el promedio por etapa y el ciclo
  // logístico promedio se sacan de agrupaciones distintas (por evento vs.
  // por unidad entregada), así que compararlos como porcentaje puede salir
  // engañoso con muestras chicas.
  const candidatos = etapasPromedio.filter((e) => e.estatus !== "Agencia");
  const top = candidatos[0];
  if (!top) return null;
  return `La etapa que más tiempo tomó dentro del ciclo logístico fue "${top.estatus}", con un promedio de ${top.promedioDias} días. Ahí es donde conviene enfocar esfuerzos para acortarlo.`;
}

function AnalisisDeCiclo({
  cicloPromedioDias,
  diasEnAgenciaPromedio,
  etapasPromedio,
  mostrarEtapas = true,
}: {
  cicloPromedioDias: number | null;
  diasEnAgenciaPromedio: number | null;
  etapasPromedio: { estatus: string; promedioDias: number; n: number }[];
  mostrarEtapas?: boolean;
}) {
  return (
    <Card>
      <CardHeader title="Análisis de ciclo de entrega" subtitle="De las unidades entregadas en este periodo" />
      <div className="p-5 space-y-4">
        {cicloPromedioDias == null ? (
          <EmptyState text="No hay unidades entregadas en este periodo para calcular el ciclo." />
        ) : (
          <>
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-3xl font-semibold text-ink-primary">{cicloPromedioDias} días</p>
                <p className="text-xs text-ink-muted">Ciclo logístico promedio (compra → listo para entregar)</p>
              </div>
              {diasEnAgenciaPromedio != null && (
                <div>
                  <p className="text-3xl font-semibold text-brand-orange-600">{diasEnAgenciaPromedio} días</p>
                  <p className="text-xs text-ink-muted">Promedio en Agencia (reparación o pago del cliente — aparte, no es de Logística)</p>
                </div>
              )}
            </div>

            {mostrarEtapas &&
              (etapasPromedio.length > 0 ? (
                <div className="space-y-3">
                  {etapasPromedio.map((e, i) => {
                    const max = etapasPromedio[0].promedioDias;
                    const pct = max > 0 ? Math.round((e.promedioDias / max) * 100) : 0;
                    return (
                      <div key={e.estatus}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className={i === 0 ? "font-semibold text-ink-primary" : "text-ink-secondary"}>{e.estatus}</span>
                          <span className="text-ink-muted">{e.promedioDias} días</span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${i === 0 ? "bg-brand-orange-500" : "bg-brand-blue-400"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-sm text-ink-secondary bg-surface-muted rounded-lg px-3 py-2.5">
                    {analisisCiclo(etapasPromedio)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-ink-muted">
                  Todavía no hay suficiente historial de movimiento por etapa en este periodo para identificar en qué proceso se atoran más las unidades — esto se va llenando conforme se muevan las unidades de etapa en etapa desde la app (cada clic en &quot;Mover a la siguiente etapa&quot; queda registrado con fecha real).
                </p>
              ))}
          </>
        )}
      </div>
    </Card>
  );
}

export const dynamic = "force-dynamic";

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getUTCDay() === 0 ? 7 : x.getUTCDay();
  x.setUTCDate(x.getUTCDate() - (day - 1));
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function endOfWeek(d: Date) {
  const x = startOfWeek(d);
  x.setUTCDate(x.getUTCDate() + 6);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}
function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function endOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}
function numeroSemana(d: Date) {
  const inicioAnio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const dias = Math.floor((d.getTime() - inicioAnio.getTime()) / 86400000);
  return Math.ceil((dias + inicioAnio.getUTCDay() + 1) / 7);
}

const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function listaSemanas(hoy: Date, cantidad = 26) {
  const semanas = [];
  for (let i = 0; i < cantidad; i++) {
    const inicio = startOfWeek(hoy);
    inicio.setUTCDate(inicio.getUTCDate() - 7 * i);
    const fin = endOfWeek(inicio);
    const value = inicio.toISOString().slice(0, 10);
    const label = `Semana ${numeroSemana(inicio)} · ${formatFecha(inicio)} – ${formatFecha(fin)}`;
    semanas.push({ value, label });
  }
  return semanas;
}

function listaMeses(hoy: Date, cantidad = 18) {
  const meses = [];
  for (let i = 0; i < cantidad; i++) {
    const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = `${MESES_ES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    meses.push({ value, label });
  }
  return meses;
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; semana?: string; mes?: string; buscar?: string }>;
}) {
  const { vista = "diario", semana, mes, buscar } = await searchParams;
  const soloLectura = await esSoloLectura();
  const hoy = new Date();

  const semanaInicio = semana ? startOfWeek(new Date(`${semana}T12:00:00Z`)) : startOfWeek(hoy);
  const semanaFin = endOfWeek(semanaInicio);

  let mesInicio: Date;
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [y, m] = mes.split("-").map(Number);
    mesInicio = new Date(Date.UTC(y, m - 1, 1));
  } else {
    mesInicio = startOfMonth(hoy);
  }
  const mesFin = endOfMonth(mesInicio);

  const diario = await getReporteDiario(hoy);
  const semanal = vista === "semanal" ? await getReporteRango(semanaInicio, semanaFin) : null;
  const mensual = vista === "mensual" ? await getReporteRango(mesInicio, mesFin) : null;

  const tabs = [
    { key: "diario", label: "Cierre diario" },
    { key: "semanal", label: "Cierre semanal" },
    { key: "mensual", label: "Cierre mensual" },
  ];

  const activo = vista === "semanal" ? semanal : vista === "mensual" ? mensual : null;

  return (
    <>
      <TopBar title="Reportes" subtitle="Cierre diario, semanal y mensual para dirección" />
      <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        <div className="no-print flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={`/reportes?vista=${t.key}`}
                className={`rounded-lg px-4 py-2 text-sm font-medium border ${
                  vista === t.key ? "bg-brand-navy text-white border-brand-navy" : "border-border text-ink-secondary hover:bg-surface-muted"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>
          <div className="no-print flex items-center gap-2">
            <Link
              href="/reportes/pantalla"
              className="flex items-center gap-2 rounded-lg border border-border hover:bg-surface-muted text-ink-secondary text-sm font-medium px-4 py-2"
            >
              <MonitorPlay size={16} />
              Modo pantalla
            </Link>
            <PrintButton />
          </div>
        </div>

        {vista === "semanal" && (
          <form className="no-print flex items-center gap-2 flex-wrap">
            <input type="hidden" name="vista" value="semanal" />
            <select
              name="semana"
              defaultValue={semanaInicio.toISOString().slice(0, 10)}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              {listaSemanas(hoy).map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button className="rounded-lg bg-brand-navy text-white text-sm font-medium px-4 py-2 hover:opacity-90">
              Ver
            </button>
          </form>
        )}

        {vista === "mensual" && (
          <form className="no-print flex items-center gap-2 flex-wrap">
            <input type="hidden" name="vista" value="mensual" />
            <select
              name="mes"
              defaultValue={`${mesInicio.getUTCFullYear()}-${String(mesInicio.getUTCMonth() + 1).padStart(2, "0")}`}
              className="rounded-lg border border-border px-3 py-2 text-sm capitalize"
            >
              {listaMeses(hoy).map((m) => (
                <option key={m.value} value={m.value} className="capitalize">
                  {m.label}
                </option>
              ))}
            </select>
            <button className="rounded-lg bg-brand-navy text-white text-sm font-medium px-4 py-2 hover:opacity-90">
              Ver
            </button>
          </form>
        )}

        {vista === "diario" && (
          <>
            <Card className="border-l-4 border-l-brand-orange-500">
              <div className="p-5">
                <p className="text-xs uppercase tracking-wide text-ink-muted">Resumen para dirección</p>
                <p className="text-lg font-semibold text-ink-primary capitalize">{formatFecha(hoy)}</p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-4">
                  <div>
                    <p className="text-2xl font-semibold text-ink-primary">{diario.eventos.length}</p>
                    <p className="text-xs text-ink-muted">Movimientos de estatus</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-ink-primary">{diario.entregasHoy.length}</p>
                    <p className="text-xs text-ink-muted">Entregas cerradas hoy</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-ink-primary">{diario.ordenesGeneradas.length}</p>
                    <p className="text-xs text-ink-muted">Órdenes de pago generadas</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-ink-primary">{formatMXN(diario.totalPagado)}</p>
                    <p className="text-xs text-ink-muted">Monto solicitado hoy</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-ink-primary">{formatMXN(diario.costoTotalUSD)}</p>
                    <p className="text-xs text-ink-muted">Costo total en USD (entregas de hoy)</p>
                  </div>
                </div>
              </div>
            </Card>

            <CostosPorConcepto costos={diario.costosPorConcepto} />

            <Card>
              <CardHeader title="Movimientos del día" />
              {diario.eventos.length === 0 ? (
                <EmptyState text="Sin movimientos registrados hoy." />
              ) : (
                <ul className="divide-y divide-border">
                  {diario.eventos.map((e) => (
                    <li key={e.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <FotoMini src={fotoSrc(e.shipment, "thumb")} alt="" className="w-11 h-11 rounded-md object-cover shrink-0 border border-border" fallbackClassName="w-11 h-11 rounded-md bg-gray-100 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-ink-primary flex items-center gap-2 flex-wrap">
                            <span>
                              {e.shipment.equipoDescripcion} — {e.shipment.cliente}
                              {e.shipment.vendedor && <span className="text-ink-muted"> ({e.shipment.vendedor})</span>}
                            </span>
                            <SerieTag serie={e.shipment.serie} />
                          </p>
                          <p className="text-xs text-ink-muted">
                            {e.estatusAnterior ? `${e.estatusAnterior} → ` : ""}
                            {e.estatusNuevo} · {e.usuario ?? "Sistema"}
                          </p>
                        </div>
                      </div>
                      <StatusBadge estatus={e.estatusNuevo} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <EntregasHoyBanner entregas={diario.entregasHoy} hrefFor={(s) => `/embarques/${s.id}`} />

            <Card>
              <CardHeader
                title="Equipos en operación"
                subtitle={`${diario.unidadesEnOperacion.length} unidad${diario.unidadesEnOperacion.length === 1 ? "" : "es"} activas, de la más reciente a la más antigua`}
                action={<Buscador />}
              />
              {(() => {
                const unidadesFiltradas = buscar
                  ? diario.unidadesEnOperacion.filter((s) =>
                      coincideBusqueda(buscar, [s.equipoDescripcion, s.cliente, s.serie, s.folio])
                    )
                  : diario.unidadesEnOperacion;
                if (unidadesFiltradas.length === 0) {
                  return <EmptyState text="No hay unidades en operación." />;
                }
                return (
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
                          <div className="flex items-center gap-2 shrink-0">
                            <CopyLinkButton folio={s.folio} />
                            <StatusBadge estatus={s.estatus} />
                          </div>
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
                            {comentariosUnidad.map((c) =>
                              soloLectura ? (
                                <li key={c.id} className="text-xs text-ink-secondary bg-surface-muted rounded-lg px-2.5 py-1.5">
                                  {c.texto}
                                </li>
                              ) : (
                                <li key={c.id} className="flex items-center gap-1.5">
                                  <form action={updateComment} className="flex-1 flex items-center gap-1.5">
                                    <input type="hidden" name="id" value={c.id} />
                                    <input
                                      name="texto"
                                      defaultValue={c.texto}
                                      className="flex-1 min-w-0 text-xs text-ink-secondary bg-surface-muted rounded-lg px-2.5 py-1.5 border-0 focus:outline-none focus:ring-1 focus:ring-brand-blue-400"
                                    />
                                    <button className="no-print text-xs text-brand-blue-700 font-medium shrink-0 hover:underline">
                                      Guardar
                                    </button>
                                  </form>
                                  <form action={deleteComment.bind(null, c.id)} className="no-print shrink-0">
                                    <ConfirmSubmitButton
                                      confirmText="¿Eliminar este comentario?"
                                      className="text-ink-muted hover:text-red-600 flex items-center"
                                      title="Eliminar comentario"
                                    >
                                      <X size={14} />
                                    </ConfirmSubmitButton>
                                  </form>
                                </li>
                              )
                            )}
                          </ul>
                        )}

                        {!soloLectura && (
                          comentariosUnidad.length < MAX_COMENTARIOS_POR_UNIDAD ? (
                            <form action={createComment} className="no-print flex items-center gap-2">
                              <input type="hidden" name="tipo" value="comentario" />
                              <input type="hidden" name="shipmentId" value={s.id} />
                              <input
                                name="texto"
                                required
                                placeholder="Comentario de hoy sobre esta unidad..."
                                className="flex-1 rounded-lg border border-border px-2.5 py-1.5 text-xs"
                              />
                              <button className="text-xs text-brand-blue-700 font-medium shrink-0 hover:underline">
                                Agregar
                              </button>
                            </form>
                          ) : (
                            <p className="no-print text-xs text-ink-muted italic">
                              Máximo {MAX_COMENTARIOS_POR_UNIDAD} comentarios por unidad — elimina alguno para agregar otro.
                            </p>
                          )
                        )}
                      </li>
                    );
                  })}
                </ul>
                );
              })()}
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
          </>
        )}

        {activo && (
          <>
            <Card className="border-l-4 border-l-brand-blue-600">
              <div className="p-5">
                <p className="text-xs uppercase tracking-wide text-ink-muted">Resumen para dirección</p>
                <p className="text-lg font-semibold text-ink-primary">
                  {formatFecha(activo.from)} — {formatFecha(activo.to)}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-4">
                  <div>
                    <p className="text-2xl font-semibold text-ink-primary">{activo.eventos.length}</p>
                    <p className="text-xs text-ink-muted">Movimientos de estatus</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-ink-primary">{activo.entregas.length}</p>
                    <p className="text-xs text-ink-muted">Unidades entregadas</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-ink-primary">{activo.ordenes.length}</p>
                    <p className="text-xs text-ink-muted">Órdenes de pago generadas</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-ink-primary">{formatMXN(activo.totalPagado)}</p>
                    <p className="text-xs text-ink-muted">Monto total solicitado</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-ink-primary">{formatMXN(activo.costoTotalUSD)}</p>
                    <p className="text-xs text-ink-muted">Costo total en USD (unidades entregadas)</p>
                  </div>
                </div>
              </div>
            </Card>

            <CostosPorConcepto costos={activo.costosPorConcepto} fuente={activo.costosPorConceptoFuente} />

            {vista === "mensual" && <CostoPromedio costos={activo.costoPromedioPorConcepto} />}
            {vista === "mensual" && <CostosPorCategoria filas={activo.costosPorCategoria} />}
            {vista === "mensual" && <TiempoPorCategoria filas={activo.tiempoPorCategoria} />}

            <AnalisisDeCiclo
              cicloPromedioDias={activo.cicloPromedioDias}
              diasEnAgenciaPromedio={activo.diasEnAgenciaPromedio}
              etapasPromedio={activo.etapasPromedio}
              mostrarEtapas={vista !== "mensual"}
            />

            {vista === "mensual" && (
              <IndiceComplejidadCard
                resumen={activo.indiceComplejidad.resumen}
                porCategoria={activo.indiceComplejidad.porCategoria}
                subtitle="1 = corto y simple · 2 = trayecto largo (>1500 millas) · 3 = necesita cama baja — de las unidades entregadas este mes"
              />
            )}

            <PagosPorProveedor
              proveedoresFleteUSA={activo.proveedoresFleteUSA}
              proveedoresAgenteAduanal={activo.proveedoresAgenteAduanal}
            />

            {vista === "mensual" && (
              <TiempoPorEtapaCard
                data={activo.etapasPromedio}
                subtitle="Dónde se detuvieron más los procesos — solo de los equipos que se entregaron este mes"
                emptyText="Sin unidades entregadas este mes con historial de etapas para calcular esto."
              />
            )}

            <Card>
              <CardHeader title="Unidades entregadas en el periodo" />
              {activo.entregas.length === 0 ? (
                <EmptyState text="Sin entregas en este periodo." />
              ) : (
                <ul className="divide-y divide-border">
                  {activo.entregas.map((s) => (
                    <li key={s.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <FotoMini src={fotoSrc(s, "thumb")} alt="" className="w-11 h-11 rounded-md object-cover shrink-0 border border-border" fallbackClassName="w-11 h-11 rounded-md bg-gray-100 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-ink-primary flex items-center gap-2">
                            {s.equipoDescripcion}
                            <SerieTag serie={s.serie} />
                          </p>
                          <p className="text-xs text-ink-muted flex items-center gap-2 flex-wrap">
                            <span>
                              {s.cliente} · {s.folio}
                              {s.vendedor && <> · {s.vendedor}</>}
                              {s.aduana && <> · Aduana: {s.aduana}</>}
                            </span>
                            <ClockBadge fechaInicio={s.fechaInicio} fechaEntrega={s.fechaEntrega} tiempoCicloDias={s.tiempoCicloDias} />
                          </p>
                          {s.incidencias && (
                            <p className="text-xs text-brand-orange-700 bg-brand-orange-50 rounded px-2 py-1 mt-1 inline-block">
                              {s.incidencias}
                            </p>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-ink-muted shrink-0">{formatFecha(s.fechaEntrega)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </main>
    </>
  );
}
