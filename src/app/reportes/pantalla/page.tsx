import FotoMini from "@/components/FotoMini";
import { fotoSrc } from "@/lib/foto-url";
import { StatusBadge, SerieTag, ClockBadge, EmptyState } from "@/components/ui";
import EstatusTimeline from "@/components/EstatusTimeline";
import AutoReload from "@/components/AutoReload";
import { getReporteDiario } from "@/lib/queries";
import { formatFecha } from "@/lib/constants";
import { calcularTimelineEstatus } from "@/lib/ciclo";
import { analisisMovimientoHoy } from "@/lib/analisis";

export const dynamic = "force-dynamic";

// "Modo pantalla": pensada para dejarla fija en un monitor/TV en la oficina.
// Sin menú ni botones (Sidebar/MobileNav se ocultan solos para esta ruta,
// ver Sidebar.tsx/MobileNav.tsx) — solo la lista de Equipos en operación,
// desplazándose sola hacia abajo sin parar (técnica: el contenido se dibuja
// DOS veces seguidas y se anima con translateY de 0% a -50%; como la
// segunda copia es idéntica a la primera, el "regreso al inicio" no se ve
// como un salto — es un bucle continuo e imperceptible, puro CSS, nunca se
// traba). Refresca sus datos cada 10 minutos (ver AutoReload) para no quedarse con datos viejos.
export default async function ReportesPantallaPage() {
  const diario = await getReporteDiario(new Date());
  const unidades = diario.unidadesEnOperacion;

  // Más unidades = recorrido más largo = más tiempo para que no se sienta
  // atropellado; con pocas unidades tampoco se pone absurdamente lento.
  const duracionSegundos = Math.max(25, unidades.length * 7);

  const Fila = ({ s }: { s: (typeof unidades)[number] }) => {
    const eventosUnidadHoy = diario.eventos.filter((e) => e.shipmentId === s.id);
    return (
      <div className="px-8 py-5 border-b border-border">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <FotoMini src={fotoSrc(s, "thumb")} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0 border border-border" fallbackClassName="w-16 h-16 rounded-xl bg-gray-100 shrink-0" />
            <div className="min-w-0">
              <p className="text-xl text-ink-primary flex items-center gap-2 flex-wrap font-medium">
                <span>
                  {s.equipoDescripcion} — {s.cliente}
                  {s.vendedor && <span className="text-ink-muted"> ({s.vendedor})</span>}
                </span>
                <SerieTag serie={s.serie} />
              </p>
              <p className="text-sm text-ink-muted flex items-center gap-2 flex-wrap mt-0.5">
                <span>{s.folio}</span>
                {s.aduana && <span>· Aduana: {s.aduana}</span>}
                <ClockBadge fechaInicio={s.fechaInicio} fechaEntrega={s.fechaEntrega} tiempoCicloDias={s.tiempoCicloDias} />
              </p>
            </div>
          </div>
          <StatusBadge estatus={s.estatus} />
        </div>

        <div className="mt-2">
          <EstatusTimeline steps={calcularTimelineEstatus(s.statusEvents, s.estatus, s.fechaInicio, s.createdAt)} />
        </div>

        <p className="text-sm text-ink-secondary italic mt-1">{analisisMovimientoHoy(s.estatus, eventosUnidadHoy)}</p>
      </div>
    );
  };

  return (
    <div className="h-dvh w-full overflow-hidden bg-surface flex flex-col">
      <AutoReload ms={10 * 60 * 1000} />

      <header className="flex items-center justify-between px-8 h-20 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-brand-orange-500 flex items-center justify-center font-bold text-white text-lg">
            MH
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-ink-primary leading-tight">Equipos en operación</h1>
            <p className="text-sm text-ink-muted capitalize">{formatFecha(new Date())}</p>
          </div>
        </div>
        <p className="text-sm text-ink-muted">{unidades.length} unidades activas</p>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden relative">
        {unidades.length === 0 ? (
          <div className="p-8">
            <EmptyState text="No hay unidades en operación." />
          </div>
        ) : (
          <div className="mh-scroll-list" style={{ animationDuration: `${duracionSegundos}s` }}>
            <div>
              {unidades.map((s) => (
                <Fila key={s.id} s={s} />
              ))}
            </div>
            <div aria-hidden="true">
              {unidades.map((s) => (
                <Fila key={`${s.id}-dup`} s={s} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
