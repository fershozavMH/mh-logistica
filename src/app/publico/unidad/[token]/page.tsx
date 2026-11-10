import FotoMini from "@/components/FotoMini";
import { fotoPublicaSrc, tokenPublicoValido } from "@/lib/foto-url";
import { Card, CardHeader, EmptyState, StatusBadge, SerieTag, ClockBadge } from "@/components/ui";
import EstatusTimeline from "@/components/EstatusTimeline";
import { getShipmentPublicoByToken } from "@/lib/queries";
import { formatFecha } from "@/lib/constants";
import { calcularTimelineEstatus } from "@/lib/ciclo";

export const dynamic = "force-dynamic";

// Ficha pública de seguimiento de UNA unidad, para compartir con el cliente
// dueño de ese equipo — sin clave de acceso. Solo trae lo que ya selecciona
// getShipmentPublicoByToken() (sin costos, proveedores, datos bancarios ni
// comentarios internos de Logística). Sidebar/MobileNav se ocultan solos
// para cualquier ruta /publico (ver Sidebar.tsx y MobileNav.tsx).
// El link lleva un token aleatorio por unidad (no el folio consecutivo), así
// que no se puede adivinar el de otra unidad. Los links viejos con folio ya
// no abren nada.
export default async function UnidadPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shipment = tokenPublicoValido(token) ? await getShipmentPublicoByToken(token) : null;

  return (
    <>
      <header className="no-print sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface/95 backdrop-blur px-4 md:px-8 h-16 shrink-0">
        <div className="h-9 w-9 rounded-lg bg-brand-orange-500 flex items-center justify-center font-bold text-white shrink-0">
          MH
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-ink-primary leading-tight truncate">Seguimiento de su unidad</h1>
          <p className="text-xs text-ink-muted truncate">Machinery Hunters</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          {!shipment ? (
            <Card>
              <div className="p-5">
                <EmptyState text="Este link no es válido. Pide a Machinery Hunters el link actualizado de tu unidad." />
              </div>
            </Card>
          ) : (
            <Card>
              <div className="p-5 flex flex-col sm:flex-row gap-4">
                <div className="w-full sm:w-48 shrink-0">
                  <FotoMini src={fotoPublicaSrc(shipment, "full")} alt="" className="w-full h-40 sm:h-36 object-cover rounded-xl border border-border" fallbackClassName="w-full h-40 sm:h-36 rounded-xl bg-gray-100 border border-border" />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-lg font-semibold text-ink-primary">{shipment.equipoDescripcion}</h2>
                      <p className="text-sm text-ink-muted flex items-center gap-2 flex-wrap mt-0.5">
                        <SerieTag serie={shipment.serie} />
                        <span>{shipment.folio}</span>
                      </p>
                    </div>
                    <StatusBadge estatus={shipment.estatus} />
                  </div>
                  <p className="text-sm text-ink-secondary">
                    Cliente: <span className="text-ink-primary font-medium">{shipment.cliente}</span>
                  </p>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-ink-muted">
                    {shipment.origenCiudad && <span>Origen: {shipment.origenCiudad}</span>}
                    {shipment.aduana && <span>· Aduana: {shipment.aduana}</span>}
                    {shipment.destinoCiudad && <span>· Destino: {shipment.destinoCiudad}</span>}
                  </div>
                  <ClockBadge
                    fechaInicio={shipment.fechaInicio}
                    fechaEntrega={shipment.fechaEntrega}
                    tiempoCicloDias={shipment.tiempoCicloDias}
                  />
                </div>
              </div>

              <div className="border-t border-border">
                <CardHeader title="Avance" subtitle={`Actualizado al ${formatFecha(new Date())}`} />
                <EstatusTimeline
                  steps={calcularTimelineEstatus(
                    shipment.statusEvents,
                    shipment.estatus,
                    shipment.fechaInicio,
                    shipment.createdAt
                  )}
                />
                <div className="h-3" />
              </div>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
