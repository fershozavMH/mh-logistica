import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCotizacion } from "@/lib/queries";
import { editarCotizacion } from "@/lib/actions";
import { Card, CardHeader, MoneyInput } from "@/components/ui";
import SelectOrNew from "@/components/SelectOrNew";
import FotoInputNueva from "@/components/FotoInputNueva";
import { esSoloLectura } from "@/lib/auth-server";
import { VENDEDORES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function EditarCotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c, soloLectura] = await Promise.all([getCotizacion(id), esSoloLectura()]);
  if (!c) notFound();
  if (soloLectura) notFound();

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="sticky top-0 z-10 bg-white border-b border-border px-6 h-16 flex items-center">
        <Link href={`/cotizaciones/${c.id}`} className="flex items-center gap-2 text-sm text-ink-secondary hover:text-ink-primary">
          <ArrowLeft size={16} />
          Volver a la cotización
        </Link>
      </div>

      <main className="max-w-xl mx-auto my-8 px-4">
        <Card>
          <CardHeader title={`Editar cotización ${c.folio}`} subtitle="Los cambios se ven reflejados en el PDF al guardar" />
          <form action={editarCotizacion.bind(null, c.id)} className="p-5 pb-20 space-y-3">
            <FotoInputNueva defaultUrl={c.fotoUrl} />

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Cliente</span>
              <input name="cliente" defaultValue={c.cliente} required className="rounded-lg border border-border px-3 py-2 text-sm" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Tipo de máquina</span>
                <input
                  name="tipoMaquina"
                  defaultValue={c.tipoMaquina}
                  required
                  placeholder="Ej. Retroexcavadora"
                  className="rounded-lg border border-border px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Año</span>
                <input name="anio" defaultValue={c.anio ?? ""} placeholder="Ej. 2014" className="rounded-lg border border-border px-3 py-2 text-sm" />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Ubicación de origen</span>
                <input name="origenCiudad" defaultValue={c.origenCiudad ?? ""} className="rounded-lg border border-border px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-ink-secondary">Ubicación de destino</span>
                <input name="destinoCiudad" defaultValue={c.destinoCiudad ?? ""} className="rounded-lg border border-border px-3 py-2 text-sm" />
              </label>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Quién la manda</span>
              <SelectOrNew name="vendedor" options={VENDEDORES} placeholder="Nombre de quien la envía" defaultValue={c.vendedor ?? ""} />
            </label>

            <div className="pt-2 border-t border-border space-y-2">
              <p className="text-xs font-medium text-ink-muted px-0.5">Desglose de costos (USD)</p>
              {[
                { key: "costoFleteUSA", label: "Flete USA", valor: c.costoFleteUSA },
                { key: "costoImportacion", label: "Importación", valor: c.costoImportacion },
                { key: "costoManiobras", label: "Maniobras", valor: c.costoManiobras },
                { key: "costoFleteMx", label: "Flete México", valor: c.costoFleteMx },
                { key: "costoPermiso", label: "Permiso/Seguro/Placas", valor: c.costoPermiso },
              ].map((cpo) => (
                <div key={cpo.key} className="grid grid-cols-[1fr_auto] gap-2 items-center">
                  <span className="text-sm text-ink-secondary">{cpo.label}</span>
                  <MoneyInput name={cpo.key} defaultValue={cpo.valor} className="w-24 rounded-md border border-border px-2 py-1.5 text-right text-sm" />
                </div>
              ))}
              <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <span className="text-sm text-ink-secondary">IVA (%)</span>
                <input
                  name="ivaPorcentaje"
                  defaultValue={c.ivaPorcentaje || ""}
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
                defaultValue={c.notas ?? ""}
                rows={3}
                placeholder="Se muestran en la cotización"
                className="rounded-lg border border-border px-3 py-2 text-sm resize-none"
              />
            </label>

            <div className="sticky bottom-0 -mx-5 px-5 py-3 bg-white border-t border-border flex items-center gap-2 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
              <Link
                href={`/cotizaciones/${c.id}`}
                className="flex-1 text-center rounded-lg border border-border text-sm font-medium py-2.5 text-ink-secondary hover:bg-gray-50"
              >
                Cancelar
              </Link>
              <button className="flex-1 rounded-lg bg-brand-blue-600 hover:bg-brand-blue-700 text-white text-sm font-medium py-2.5">
                Guardar cambios
              </button>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
}
