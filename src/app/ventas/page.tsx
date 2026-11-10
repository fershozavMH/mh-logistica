import SubmitButton from "@/components/SubmitButton";
import Link from "next/link";
import TopBar from "@/components/TopBar";
import { Card, CardHeader, EmptyState, Pill, SerieTag, ClockBadge, StatCard, StatusBadge } from "@/components/ui";
import SelectOrNew from "@/components/SelectOrNew";
import Buscador from "@/components/Buscador";
import { createSale, crearVentaServicio } from "@/lib/actions";
import { getVentas, getVentasPorVendedor, getVentasServicioLogistico } from "@/lib/queries";
import { esSoloLectura } from "@/lib/auth-server";
import { MESES, TIPOS_UNIDAD, formatFecha, formatMXN, ADUANAS, VENDEDORES, coincideBusqueda } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { Handshake, TrendingUp, Layers } from "lucide-react";

export const dynamic = "force-dynamic";

const CONCEPTOS_SERVICIO = [
  { costo: "costoFleteUSA", precio: "precioFleteUSA", label: "Flete USA" },
  { costo: "costoImportacion", precio: "precioImportacion", label: "Importación / Aduana" },
  { costo: "costoFleteMx", precio: "precioFleteMx", label: "Flete México" },
  { costo: "costoPermiso", precio: "precioPermiso", label: "Permiso" },
  { costo: "costoSeguro", precio: "precioSeguro", label: "Seguro" },
  { costo: "costoPlacas", precio: "precioPlacas", label: "Placas" },
] as const;

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<{ buscar?: string }>;
}) {
  const { buscar } = await searchParams;
  const [ventasTodas, porVendedor, shipments, serviciosLogisticosTodos, soloLectura] = await Promise.all([
    getVentas(),
    getVentasPorVendedor(),
    prisma.shipment.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    getVentasServicioLogistico(),
    esSoloLectura(),
  ]);

  const ventas = buscar
    ? ventasTodas.filter((v) =>
        coincideBusqueda(buscar, [v.comprador, v.shipment?.equipoDescripcion, v.shipment?.serie, v.shipment?.folio])
      )
    : ventasTodas;
  const serviciosLogisticos = buscar
    ? serviciosLogisticosTodos.filter((v) =>
        coincideBusqueda(buscar, [v.shipment.cliente, v.shipment.equipoDescripcion, v.shipment.serie, v.shipment.folio])
      )
    : serviciosLogisticosTodos;

  const utilidadAcumulada = serviciosLogisticos.reduce((a, v) => a + v.utilidadTotal, 0);
  const utilidadPromedio = serviciosLogisticos.length ? utilidadAcumulada / serviciosLogisticos.length : 0;

  return (
    <>
      <TopBar title="Ventas" subtitle="Registro de ventas de Jaime y Raúl" />
      <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        <div className="flex justify-end">
          <Buscador />
        </div>
        {/* ------------------------------------------------------------- */}
        {/* Servicios logísticos vendidos a clientes externos (no equipo) */}
        {/* ------------------------------------------------------------- */}
        <div>
          <h2 className="text-sm font-semibold text-ink-primary uppercase tracking-wide mb-3">
            Servicios logísticos (clientes externos)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard label="Servicios vendidos" value={serviciosLogisticos.length} icon={Handshake} tone="blue" />
            <StatCard label="Utilidad acumulada" value={formatMXN(utilidadAcumulada)} icon={TrendingUp} tone="navy" />
            <StatCard label="Utilidad promedio por servicio" value={formatMXN(utilidadPromedio)} icon={Layers} tone="orange" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {!soloLectura && (
            <Card className="lg:col-span-1">
              <CardHeader title="Vender servicio logístico" subtitle="Flete, importación o permiso/seguro/placas suelto, sin equipo propio de MH" />
              <form action={crearVentaServicio} className="p-5 space-y-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-secondary">Cliente</span>
                  <input name="cliente" required className="rounded-lg border border-border px-3 py-2 text-sm" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-secondary">¿Qué se va a mover?</span>
                  <input
                    name="equipoDescripcion"
                    required
                    placeholder="Ej. Excavadora CAT 320 del cliente"
                    className="rounded-lg border border-border px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-secondary">Serie (opcional)</span>
                  <input name="serie" className="rounded-lg border border-border px-3 py-2 text-sm" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-secondary">Vendedor</span>
                  <SelectOrNew name="vendedor" options={VENDEDORES} placeholder="Nombre del vendedor" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-secondary">Aduana (opcional)</span>
                  <select name="aduana" className="rounded-lg border border-border px-3 py-2 text-sm">
                    <option value="">Selecciona…</option>
                    {ADUANAS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="pt-2 border-t border-border space-y-2">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs font-medium text-ink-muted px-0.5">
                    <span>Concepto</span>
                    <span className="w-20 text-right">Costo real</span>
                    <span className="w-20 text-right">Precio cliente</span>
                  </div>
                  {CONCEPTOS_SERVICIO.map((c) => (
                    <div key={c.costo} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                      <span className="text-sm text-ink-secondary">{c.label}</span>
                      <input
                        name={c.costo}
                        placeholder="0.00"
                        inputMode="decimal"
                        className="w-20 rounded-md border border-border px-2 py-1.5 text-right text-sm"
                      />
                      <input
                        name={c.precio}
                        placeholder="0.00"
                        inputMode="decimal"
                        className="w-20 rounded-md border border-brand-blue-200 bg-brand-blue-50 px-2 py-1.5 text-right text-sm"
                      />
                    </div>
                  ))}
                </div>

                <SubmitButton className="w-full rounded-lg bg-brand-blue-600 hover:bg-brand-blue-700 text-white text-sm font-medium py-2.5 mt-2">
                  Registrar venta de servicio
                </SubmitButton>
                <p className="text-xs text-ink-muted">
                  Se agrega automáticamente a Operaciones para darle seguimiento de estatus.
                </p>
              </form>
            </Card>
            )}

            <Card className={soloLectura ? "lg:col-span-3" : "lg:col-span-2"}>
              <CardHeader title="Utilidad por servicio vendido" subtitle="Precio al cliente menos costo real, por concepto" />
              {serviciosLogisticos.length === 0 ? (
                <EmptyState text="Aún no hay servicios logísticos registrados." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-ink-muted border-b border-border">
                        <th className="px-5 py-2.5 font-medium">Cliente</th>
                        <th className="px-5 py-2.5 font-medium">Estatus</th>
                        {CONCEPTOS_SERVICIO.map((c) => (
                          <th key={c.costo} className="px-5 py-2.5 font-medium text-right">
                            {c.label}
                          </th>
                        ))}
                        <th className="px-5 py-2.5 font-medium text-right">Utilidad total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serviciosLogisticos.map((v) => (
                        <tr key={v.shipment.id} className="border-b border-border last:border-0 hover:bg-surface-muted">
                          <td className="px-5 py-2.5">
                            <Link href={`/embarques/${v.shipment.id}`} className="text-ink-primary hover:text-brand-blue-700 font-medium">
                              {v.shipment.cliente}
                            </Link>
                            <p className="text-xs text-ink-muted">{v.shipment.equipoDescripcion}</p>
                          </td>
                          <td className="px-5 py-2.5">
                            <StatusBadge estatus={v.shipment.estatus} />
                          </td>
                          {v.conceptos.map((c) => (
                            <td
                              key={c.label}
                              className={`px-5 py-2.5 text-right ${c.utilidad >= 0 ? "text-ink-primary" : "text-red-600"}`}
                            >
                              {formatMXN(c.utilidad)}
                            </td>
                          ))}
                          <td className={`px-5 py-2.5 text-right font-semibold ${v.utilidadTotal >= 0 ? "text-brand-blue-700" : "text-red-600"}`}>
                            {formatMXN(v.utilidadTotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* Ventas de equipo (operación interna de MH) — lo que ya había  */}
        {/* ------------------------------------------------------------- */}
        <h2 className="text-sm font-semibold text-ink-primary uppercase tracking-wide pt-2">
          Ventas de equipo (operación interna)
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {!soloLectura && (
          <Card className="lg:col-span-1">
            <CardHeader title="Registrar venta" />
            <form action={createSale} className="p-5 space-y-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Vendedor</span>
                <SelectOrNew name="vendedor" options={VENDEDORES} placeholder="Nombre del vendedor" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Comprador / cliente</span>
                <input name="comprador" className="rounded-lg border border-border px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Unidad relacionada (opcional)</span>
                <select name="shipmentId" className="rounded-lg border border-border px-3 py-2 text-sm">
                  <option value="">Sin vincular</option>
                  {shipments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.folio} · {s.equipoDescripcion}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-secondary">Tipo</span>
                  <select name="tipoUnidad" className="rounded-lg border border-border px-3 py-2 text-sm">
                    {TIPOS_UNIDAD.map((t) => (
                      <option key={t} value={t}>
                        {t === "CAMION" ? "Camión" : "Amarilla"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-secondary">Mes</span>
                  <select name="mes" defaultValue={MESES[new Date().getMonth()]} className="rounded-lg border border-border px-3 py-2 text-sm">
                    {MESES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-secondary">Fecha</span>
                  <input type="date" name="fecha" className="rounded-lg border border-border px-3 py-2 text-sm" />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-ink-secondary">Ciclo (días)</span>
                  <input type="number" name="tiempoCicloDias" className="rounded-lg border border-border px-3 py-2 text-sm" />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="fleteMex" defaultChecked />
                <span className="text-ink-secondary">Incluye flete México</span>
              </label>
              <SubmitButton className="w-full rounded-lg bg-brand-blue-600 hover:bg-brand-blue-700 text-white text-sm font-medium py-2.5">
                Guardar venta
              </SubmitButton>
            </form>
          </Card>
          )}

          <Card className={soloLectura ? "lg:col-span-3" : "lg:col-span-2"}>
            <CardHeader title="Ventas por persona" />
            <div className="p-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
              {porVendedor.length === 0 ? (
                <EmptyState text="Aún no hay ventas capturadas desde la app." />
              ) : (
                porVendedor.map((v) => (
                  <div key={v.vendedor} className="rounded-lg border border-border p-4">
                    <p className="text-2xl font-semibold text-ink-primary">{v.cantidad}</p>
                    <p className="text-xs text-ink-muted mt-1">{v.vendedor}</p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader title="Historial de ventas registradas en la app" />
          {ventas.length === 0 ? (
            <EmptyState text="Todavía no hay ventas registradas desde aquí." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-ink-muted border-b border-border">
                    <th className="px-5 py-2.5 font-medium">Vendedor</th>
                    <th className="px-5 py-2.5 font-medium">Comprador</th>
                    <th className="px-5 py-2.5 font-medium">Unidad</th>
                    <th className="px-5 py-2.5 font-medium">Serie</th>
                    <th className="px-5 py-2.5 font-medium">Tipo</th>
                    <th className="px-5 py-2.5 font-medium">Mes</th>
                    <th className="px-5 py-2.5 font-medium">Reloj</th>
                    <th className="px-5 py-2.5 font-medium">Flete Mx</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map((v) => (
                    <tr key={v.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-2.5 font-medium text-ink-primary">{v.vendedor}</td>
                      <td className="px-5 py-2.5">{v.comprador ?? "—"}</td>
                      <td className="px-5 py-2.5">{v.shipment?.equipoDescripcion ?? "—"}</td>
                      <td className="px-5 py-2.5">{v.shipment ? <SerieTag serie={v.shipment.serie} /> : "—"}</td>
                      <td className="px-5 py-2.5">
                        <Pill tone={v.tipoUnidad === "AMARILLO" ? "orange" : "blue"}>{v.tipoUnidad ?? "—"}</Pill>
                      </td>
                      <td className="px-5 py-2.5">{v.mes ?? "—"}</td>
                      <td className="px-5 py-2.5">
                        {v.shipment ? (
                          <ClockBadge
                            fechaInicio={v.shipment.fechaInicio}
                            fechaEntrega={v.shipment.fechaEntrega}
                            tiempoCicloDias={v.tiempoCicloDias}
                          />
                        ) : (
                          `${v.tiempoCicloDias ?? "—"} días`
                        )}
                      </td>
                      <td className="px-5 py-2.5">{v.fleteMex ? "Sí" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>
    </>
  );
}
