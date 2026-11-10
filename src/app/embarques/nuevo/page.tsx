import SubmitButton from "@/components/SubmitButton";
import TopBar from "@/components/TopBar";
import { Card, CardHeader } from "@/components/ui";
import SelectOrNew from "@/components/SelectOrNew";
import CategoriaTipoSelect from "@/components/CategoriaTipoSelect";
import { createShipment } from "@/lib/actions";
import { getProveedores } from "@/lib/queries";
import { ADUANAS, ESTATUS_FLOW, VENDEDORES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function NuevoEmbarquePage() {
  const proveedores = await getProveedores();
  return (
    <>
      <TopBar title="Nueva unidad" subtitle="Da de alta un equipo para darle seguimiento" showBack />
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <Card className="max-w-3xl mx-auto">
          <CardHeader title="Datos del equipo" />
          <form action={createShipment} className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-ink-secondary">Descripción del equipo</span>
              <input
                name="equipoDescripcion"
                required
                placeholder="Ej. Grúa Titán 2016 FREIGHTLINER 10 ton"
                className="rounded-lg border border-border px-3 py-2 text-sm"
              />
            </label>

            <CategoriaTipoSelect />

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Serie</span>
              <input name="serie" required className="rounded-lg border border-border px-3 py-2 text-sm" />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Cliente</span>
              <input name="cliente" required className="rounded-lg border border-border px-3 py-2 text-sm" />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Vendedor</span>
              <SelectOrNew name="vendedor" options={VENDEDORES} placeholder="Nombre del vendedor" />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Estatus inicial</span>
              <select name="estatus" defaultValue="Pendiente" className="rounded-lg border border-border px-3 py-2 text-sm">
                {ESTATUS_FLOW.filter((e) => e.key !== "Cancelado").map((e) => (
                  <option key={e.key} value={e.key}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Origen (ciudad, estado)</span>
              <input name="origenCiudad" placeholder="Ej. Phoenix, AZ" className="rounded-lg border border-border px-3 py-2 text-sm" />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Aduana</span>
              <select name="aduana" className="rounded-lg border border-border px-3 py-2 text-sm">
                <option value="">Selecciona…</option>
                {ADUANAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Destino (ciudad del cliente)</span>
              <input name="destinoCiudad" className="rounded-lg border border-border px-3 py-2 text-sm" />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Fecha de inicio (arranca el reloj)</span>
              <input
                type="date"
                name="fechaInicio"
                defaultValue={new Date().toISOString().slice(0, 10)}
                className="rounded-lg border border-border px-3 py-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Fecha de salida programada</span>
              <input type="date" name="fechaSalidaProgramada" className="rounded-lg border border-border px-3 py-2 text-sm" />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Millas recorridas</span>
              <input
                type="number"
                name="millas"
                min="0"
                step="any"
                placeholder="Ej. 1850"
                className="rounded-lg border border-border px-3 py-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Proveedor de compra</span>
              <SelectOrNew name="proveedorCompra" options={proveedores.proveedorCompra} />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Proveedor flete USA</span>
              <SelectOrNew name="provFleteUSA" options={proveedores.provFleteUSA} />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Agente aduanal</span>
              <SelectOrNew name="provAgenteAduanal" options={proveedores.provAgenteAduanal} />
            </label>

            <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
              <SubmitButton pendingText="Guardando…"
                type="submit"
                className="rounded-lg bg-brand-blue-600 hover:bg-brand-blue-700 text-white text-sm font-medium px-5 py-2.5"
              >
                Guardar unidad
              </SubmitButton>
            </div>
          </form>
        </Card>
      </main>
    </>
  );
}
