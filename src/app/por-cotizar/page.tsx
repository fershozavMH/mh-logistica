import { ClipboardList, Clock, CheckCircle2 } from "lucide-react";
import TopBar from "@/components/TopBar";
import { Card, CardHeader, EmptyState, StatCard, MoneyInput, Pill } from "@/components/ui";
import { capturarEstimacion, reenviarEstimacion } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { esSoloLectura } from "@/lib/auth-server";
import { formatMXN, formatFecha } from "@/lib/constants";

export const dynamic = "force-dynamic";

type Solicitud = Awaited<ReturnType<typeof getSolicitudes>>[number];

function getSolicitudes() {
  return prisma.solicitudEstimacion.findMany({
    where: { estatus: { not: "Cancelada" } },
    orderBy: { createdAt: "desc" },
  });
}

function FormEstimacion({ s, soloLectura }: { s: Solicitud; soloLectura: boolean }) {
  return (
    <form action={capturarEstimacion} className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
      <input type="hidden" name="id" value={s.id} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-secondary">Flete USA (USD)</span>
        <MoneyInput name="estFleteUSA" defaultValue={s.estFleteUSA ?? ""} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-secondary">Importación (USD)</span>
        <MoneyInput name="estImportacion" defaultValue={s.estImportacion ?? ""} />
      </label>
      {!soloLectura && (
        <button
          type="submit"
          className="rounded-lg bg-brand-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-orange-600"
        >
          {s.estatus === "Estimada" ? "Actualizar y enviar" : "Enviar estimado"}
        </button>
      )}
    </form>
  );
}

export default async function PorCotizarPage() {
  const [solicitudes, soloLectura] = await Promise.all([getSolicitudes(), esSoloLectura()]);
  const pendientes = solicitudes.filter((s) => s.estatus === "Pendiente");
  const estimadas = solicitudes.filter((s) => s.estatus === "Estimada");
  const sinEnviar = estimadas.filter((s) => !s.erpEnviado).length;

  return (
    <>
      <TopBar title="Por cotizar" subtitle="Equipos que Compras pidió estimar antes de comprarlos" />
      <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Por cotizar" value={pendientes.length} icon={Clock} tone="orange" />
          <StatCard label="Estimadas" value={estimadas.length} icon={CheckCircle2} tone="blue" />
          <StatCard
            label="Sin confirmar en el ERP"
            value={sinEnviar}
            icon={ClipboardList}
            tone="navy"
            hint={sinEnviar ? "Reenvíalas abajo" : undefined}
          />
        </div>

        <Card>
          <CardHeader title="Pendientes de estimar" subtitle="Captura el flete y la importación estimados; se mandan al ERP al enviar" />
          {pendientes.length === 0 ? (
            <EmptyState text="No hay equipos por cotizar." />
          ) : (
            <div className="divide-y divide-border">
              {pendientes.map((s) => (
                <div key={s.id} className="p-5 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-sm">{s.equipoDescripcion}</p>
                    <Pill tone="blue">{s.erpEquipoId}</Pill>
                    {s.estimadoAt && <Pill tone="orange">Reabierta por Compras</Pill>}
                  </div>
                  <p className="text-xs text-ink-muted">
                    {[
                      s.serie && `Serie ${s.serie}`,
                      s.proveedor,
                      s.origenCiudad,
                      s.precioCompra != null && `Compra ${formatMXN(s.precioCompra)}`,
                      s.comprador && `Comprador: ${s.comprador}`,
                      `Pedida ${formatFecha(s.createdAt)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {s.notas && <p className="text-sm text-ink-secondary">“{s.notas}”</p>}
                  <FormEstimacion s={s} soloLectura={soloLectura} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Estimadas" subtitle="Se pueden corregir y volver a enviar" />
          {estimadas.length === 0 ? (
            <EmptyState text="Todavía no hay estimaciones enviadas." />
          ) : (
            <div className="divide-y divide-border">
              {estimadas.map((s) => (
                <div key={s.id} className="p-5 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-sm">{s.equipoDescripcion}</p>
                    <Pill tone="blue">{s.erpEquipoId}</Pill>
                    <Pill tone={s.erpEnviado ? "gray" : "orange"}>{s.erpEnviado ? "Enviada al ERP" : "No confirmada por el ERP"}</Pill>
                  </div>
                  <p className="text-xs text-ink-muted">
                    Estimó {s.estimadoPor} el {formatFecha(s.estimadoAt)} · Flete USA {formatMXN(s.estFleteUSA ?? 0)} · Importación{" "}
                    {formatMXN(s.estImportacion ?? 0)}
                  </p>
                  {!s.erpEnviado && s.erpError && <p className="text-xs text-red-600">{s.erpError}</p>}
                  {!soloLectura && !s.erpEnviado && (
                    <form action={reenviarEstimacion}>
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-gray-50">
                        Reenviar al ERP
                      </button>
                    </form>
                  )}
                  <details>
                    <summary className="text-xs text-brand-blue-700 cursor-pointer">Corregir estimado</summary>
                    <div className="pt-3">
                      <FormEstimacion s={s} soloLectura={soloLectura} />
                    </div>
                  </details>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>
    </>
  );
}
