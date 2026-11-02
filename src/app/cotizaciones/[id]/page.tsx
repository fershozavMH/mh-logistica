import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCotizacion } from "@/lib/queries";
import { formatFecha, formatMXN, CONTACTO_EMPRESA } from "@/lib/constants";
import { eliminarCotizacion, aceptarCotizacion, rechazarCotizacion } from "@/lib/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import PrintButton from "@/components/PrintButton";
import { esSoloLectura } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export default async function CotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c, soloLectura] = await Promise.all([getCotizacion(id), esSoloLectura()]);
  if (!c) notFound();

  const lineas = [
    { label: "Flete USA", valor: c.costoFleteUSA },
    { label: "Importación / Aduana", valor: c.costoImportacion },
    { label: "Maniobras", valor: c.costoManiobras },
    { label: "Flete México", valor: c.costoFleteMx },
    { label: "Permiso/Seguro/Placas", valor: c.costoPermiso },
  ].filter((l) => l.valor > 0);

  const subtotal = c.costoFleteUSA + c.costoImportacion + c.costoManiobras + c.costoFleteMx + c.costoPermiso;
  const iva = subtotal * (c.ivaPorcentaje / 100);
  const total = subtotal + iva;

  return (
    <div className="h-full overflow-y-auto bg-gray-100 print:bg-white">
      <div className="no-print sticky top-0 z-10 bg-white border-b border-border px-6 h-16 flex items-center justify-between flex-wrap gap-3">
        <Link href="/cotizaciones" className="flex items-center gap-2 text-sm text-ink-secondary hover:text-ink-primary">
          <ArrowLeft size={16} />
          Volver a cotizaciones
        </Link>
        <div className="flex items-center gap-3">
          {!soloLectura && (
            <>
              {c.estatus === "Pendiente" && (
                <>
                  <form action={rechazarCotizacion.bind(null, c.id)}>
                    <button className="rounded-lg border border-border text-sm px-4 py-2 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200">
                      Marcar rechazada
                    </button>
                  </form>
                  <form action={aceptarCotizacion.bind(null, c.id)}>
                    <button className="rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2">
                      Cliente aceptó — pasar a venta
                    </button>
                  </form>
                </>
              )}
              <Link
                href={`/cotizaciones/${c.id}/editar`}
                className="rounded-lg border border-border text-sm px-4 py-2 text-ink-secondary hover:bg-gray-50"
              >
                Editar
              </Link>
              <form action={eliminarCotizacion.bind(null, c.id)}>
                <ConfirmSubmitButton
                  confirmText={`¿Eliminar la cotización ${c.folio}? Esto no se puede deshacer.`}
                  className="rounded-lg border border-border text-sm px-4 py-2 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                >
                  Eliminar
                </ConfirmSubmitButton>
              </form>
            </>
          )}
          <PrintButton />
        </div>
      </div>

      <div className="max-w-3xl mx-auto bg-white shadow-sm print:shadow-none my-8 print:my-0 p-10 print:p-5 print:text-sm">
        <div className="flex items-start justify-between border-b-4 border-brand-navy pb-6 mb-6 print:pb-3 print:mb-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-brand-orange-500 flex items-center justify-center font-bold text-white text-lg">
              MH
            </div>
            <div>
              <p className="font-bold text-lg text-ink-primary leading-tight">MACHINERYHUNTERS</p>
              <p className="text-xs text-ink-muted leading-tight">Cotización Logística</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-ink-muted">Cotización</p>
            <p className="text-xl font-bold text-brand-navy">{c.folio}</p>
            <p className="text-xs text-ink-muted mt-1">{formatFecha(c.fecha)}</p>
            <span
              className={`inline-block mt-2 text-xs font-medium rounded-full px-3 py-1 ${
                c.estatus === "Aceptada"
                  ? "bg-green-100 text-green-700"
                  : c.estatus === "Rechazada"
                    ? "bg-gray-200 text-gray-500 line-through"
                    : "bg-brand-orange-100 text-brand-orange-700"
              }`}
            >
              {c.estatus}
            </span>
          </div>
        </div>

        <div className="flex gap-6 mb-8 print:mb-4">
          {c.fotoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.fotoUrl}
              alt={c.tipoMaquina}
              className="w-40 h-40 print:w-24 print:h-24 object-cover rounded-lg border border-border shrink-0"
            />
          )}
          <div className="grid grid-cols-2 gap-6 text-sm flex-1">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-muted mb-1">Cliente</p>
              <p className="font-medium text-ink-primary">{c.cliente}</p>
              <p className="text-xs uppercase tracking-wide text-ink-muted mb-1 mt-3">Equipo</p>
              <p className="font-medium text-ink-primary">
                {c.tipoMaquina} {c.anio}
              </p>
            </div>
            <div>
              {(c.origenCiudad || c.destinoCiudad) && (
                <>
                  <p className="text-xs uppercase tracking-wide text-ink-muted mb-1">Ruta</p>
                  {c.origenCiudad && <p className="text-ink-secondary">Origen: {c.origenCiudad}</p>}
                  {c.destinoCiudad && <p className="text-ink-secondary">Destino: {c.destinoCiudad}</p>}
                </>
              )}
            </div>
          </div>
        </div>

        <table className="w-full text-sm mb-6 print:mb-3">
          <thead>
            <tr className="border-b-2 border-brand-navy text-left">
              <th className="py-2 text-ink-secondary font-medium">Desglose de costos</th>
              <th className="py-2 text-ink-secondary font-medium text-right">Dólares</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.label} className="border-b border-border">
                <td className="py-2.5 text-ink-primary">{l.label}</td>
                <td className="py-2.5 text-right text-ink-primary">{formatMXN(l.valor)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-b border-border">
              <td className="pt-3 text-ink-secondary">Sub Total</td>
              <td className="pt-3 text-right text-ink-secondary">{formatMXN(subtotal)}</td>
            </tr>
            {c.ivaPorcentaje > 0 && (
              <tr>
                <td className="py-1 text-ink-secondary">IVA ({c.ivaPorcentaje}%)</td>
                <td className="py-1 text-right text-ink-secondary">{formatMXN(iva)}</td>
              </tr>
            )}
            <tr>
              <td className="pt-3 font-semibold text-ink-primary text-lg">Total</td>
              <td className="pt-3 text-right font-bold text-xl text-brand-navy">{formatMXN(total)}</td>
            </tr>
          </tfoot>
        </table>

        {c.notas && (
          <div className="mb-6 print:mb-3 rounded-lg border border-border p-3 print:p-2">
            <p className="text-xs font-semibold text-ink-secondary mb-1">Comentarios</p>
            <p className="text-sm text-ink-primary whitespace-pre-wrap">{c.notas}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-10 mt-16 pt-8 print:mt-8 print:pt-3">
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2">
              <p className="text-sm font-medium text-ink-primary">{c.vendedor ? `Lic. ${c.vendedor}` : "Machinery Hunters"}</p>
              <p className="text-xs text-ink-muted">Representante</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2">
              <p className="text-sm font-medium text-ink-primary">&nbsp;</p>
              <p className="text-xs text-ink-muted">C. Firma</p>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-4 print:mt-4 print:pt-2 border-t border-border text-[11px] text-ink-muted space-y-1 print:space-y-0.5">
          <p className="font-semibold text-ink-secondary">Términos y condiciones:</p>
          <p>1) El cliente expresa su completo entendimiento y acepta que los costos directos presentados son una estimación.</p>
          <p>
            2) El cliente entiende que el servicio de flete prestado es una subcontratación, por lo que no nos hacemos
            responsables de los inconvenientes adicionales que se puedan presentar.
          </p>
          <p>
            3) Se entiende que, para la entrega de la documentación original del equipo, no se tiene que tener adeudo
            alguno con los prestadores del servicio.
          </p>
        </div>

        <div className="mt-6 pt-4 print:mt-3 print:pt-2 border-t border-border flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-muted">
          <span>{CONTACTO_EMPRESA.direccion}</span>
          <span>{CONTACTO_EMPRESA.correo}</span>
          <span>{CONTACTO_EMPRESA.telefono}</span>
        </div>
      </div>
    </div>
  );
}
