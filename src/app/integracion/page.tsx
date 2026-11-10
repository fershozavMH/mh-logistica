import { redirect } from "next/navigation";
import TopBar from "@/components/TopBar";
import { Card, CardHeader } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import CopiarTexto from "@/components/CopiarTexto";
import { prisma } from "@/lib/prisma";
import { getSesion } from "@/lib/auth-server";
import { erpConfigurado } from "@/lib/erp-client";
import { probarConexionERP } from "@/lib/integracion-actions";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

const fecha = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Hermosillo" }).format(d) : "—";

function hostERP(): string {
  try {
    return new URL(process.env.ERP_URL ?? "").host || "—";
  } catch {
    return "no configurado";
  }
}

export default async function IntegracionPage({ searchParams }: { searchParams: Promise<{ r?: string; u?: string; ms?: string; m?: string; s?: string }> }) {
  const sesion = await getSesion();
  if (!sesion || sesion.rol !== "total") redirect("/");
  const q = await searchParams;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const base = `${h.get("x-forwarded-proto") ?? "https"}://${host}`;

  const [estados, bitacora, ordenesPend, unidadesPend, estimPend] = await Promise.all([
    prisma.integracionEstado.findMany({ orderBy: { clave: "asc" } }),
    prisma.auditLog.findMany({ where: { entidad: "ERP" }, orderBy: { fecha: "desc" }, take: 15, select: { id: true, fecha: true, accion: true, httpStatus: true, detalle: true, entidadId: true } }),
    prisma.paymentOrder.count({ where: { erpEnviado: false, estatusPago: { not: "Cancelada" } } }).catch(() => 0),
    prisma.shipment.count({ where: { erpId: null, origenERP: false } }).catch(() => 0),
    prisma.solicitudEstimacion.count({ where: { OR: [{ estatus: "Pendiente" }, { estatus: "Estimada", erpEnviado: false }] } }).catch(() => 0),
  ]);

  const configurado = erpConfigurado();
  const tokenEntrante = !!process.env.MH_LOGISTICA_TOKEN?.trim();
  const entorno = process.env.VERCEL_ENV ?? "local";
  const urls = [
    { nombre: "Unidades (ERP → Logística)", url: `${base}/api/erp/unidades` },
    { nombre: "Estatus de pago (ERP → Logística)", url: `${base}/api/erp/ordenes-pago/estatus` },
    { nombre: "Solicitudes de estimación (ERP → Logística)", url: `${base}/api/erp/solicitudes-estimacion` },
  ];

  const fila = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <span className="text-ink-secondary">{k}</span>
      <span className="text-right font-medium text-ink-primary">{v}</span>
    </div>
  );

  return (
    <>
      <TopBar title="Integración con el ERP" subtitle="Solo administrador · nunca se muestran llaves" />
      <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        <Card>
          <CardHeader title="Conexión Logística → ERP" subtitle="Revisa que este despliegue pueda hablar con el ERP antes de probar." />
          <div className="p-5 divide-y divide-border">
            {fila("Entorno de esta app", entorno === "production" ? "Producción" : entorno === "preview" ? "Preview (pruebas)" : entorno)}
            {fila("ERP al que apunta", hostERP())}
            {fila("Llaves de salida (ERP_API_KEY/SECRET)", configurado ? "Configuradas" : "Faltan o ERP_URL no es https")}
            {fila("Token de entrada (MH_LOGISTICA_TOKEN)", tokenEntrante ? "Configurado" : "Falta")}
          </div>
          <div className="px-5 pb-5 space-y-3">
            <form action={probarConexionERP}>
              <SubmitButton pendingText="Probando…" className="rounded-lg bg-brand-navy text-white text-sm font-medium px-4 py-2">
                Probar conexión con el ERP
              </SubmitButton>
            </form>
            {q.r === "ok" && (
              <p className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
                Conexión correcta: el ERP contestó en {q.ms} ms como <strong>{q.u}</strong>.
              </p>
            )}
            {q.r === "error" && (
              <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                No se pudo: {q.m}{q.s ? ` (HTTP ${q.s})` : ""}
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Direcciones que usa el ERP para llamar a Logística" subtitle="Van con el token Bearer de siempre (no cambia)." />
          <div className="p-5 space-y-3">
            {urls.map((u) => (
              <div key={u.url} className="space-y-1">
                <p className="text-xs text-ink-muted">{u.nombre}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all rounded-lg bg-surface-muted px-3 py-2 text-xs">{u.url}</code>
                  <CopiarTexto texto={u.url} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Pendientes de sincronizar" />
          <div className="p-5 divide-y divide-border">
            {fila("Órdenes de pago sin enviar al ERP", ordenesPend)}
            {fila("Unidades capturadas aquí sin trato en el ERP", unidadesPend)}
            {fila("Estimaciones por atender o por reenviar", estimPend)}
            {estados.map((e) => fila(`Última sincronización: ${e.clave}`, `${fecha(e.ultimaVez)}${e.ultimoError ? " · con error" : ""}`))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Últimas llamadas con el ERP" />
          <div className="divide-y divide-border">
            {bitacora.length === 0 && <p className="p-5 text-sm text-ink-muted">Todavía no hay llamadas registradas.</p>}
            {bitacora.map((b) => (
              <div key={b.id} className="px-5 py-3 text-xs flex flex-wrap justify-between gap-2">
                <span className="font-medium text-ink-primary">{b.accion}{b.entidadId ? ` · ${b.entidadId}` : ""}</span>
                <span className="text-ink-muted">{b.httpStatus ?? "—"} · {fecha(b.fecha)}</span>
                {b.detalle && <span className="w-full text-ink-secondary break-words">{b.detalle}</span>}
              </div>
            ))}
          </div>
        </Card>
      </main>
    </>
  );
}
