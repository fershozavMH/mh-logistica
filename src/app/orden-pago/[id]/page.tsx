import SubmitButton from "@/components/SubmitButton";
import FotoMini from "@/components/FotoMini";
import { fotoSrc } from "@/lib/foto-url";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatFecha, formatMXN, formatPesos } from "@/lib/constants";
import PrintButton from "@/components/PrintButton";
import { cancelarOrdenDePago, eliminarOrdenDePago, reintentarEnvioERP, marcarOrdenPagadaManual, quitarPagoManual } from "@/lib/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { esSoloLectura, esAdmin } from "@/lib/auth-server";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OrdenPagoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, soloLectura, admin] = await Promise.all([
    prisma.paymentOrder.findUnique({
      where: { id },
      include: { shipment: true, gastosGenerales: { orderBy: { createdAt: "asc" } } },
    }),
    esSoloLectura(),
    esAdmin(),
  ]);
  if (!order || order.eliminadaAt) notFound();

  const s = order.shipment;

  const lineas = s
    ? [
        { label: "Flete USA", valor: order.costoFleteUSA },
        { label: "Importación / Aduana", valor: order.costoImportacion },
        { label: "Bond/Canadá", valor: order.costoBondCanada },
        { label: "Maniobra/Reparación", valor: order.costoManiobras },
        { label: "Flete México", valor: order.costoFleteMx },
        { label: "Permiso", valor: order.costoPermiso },
        { label: "Seguro", valor: order.costoSeguro },
        { label: "Placas", valor: order.costoPlacas },
        { label: "Repuve/Título", valor: order.costoRepuveTitulo },
      ].filter((l) => l.valor > 0)
    : order.gastosGenerales.map((g) => ({ label: g.descripcion, valor: g.monto }));

  return (
    <div className="h-full overflow-y-auto bg-gray-100 print:bg-white">
      <div className="no-print sticky top-0 z-10 bg-white border-b border-border px-6 h-16 flex items-center justify-between">
        <Link href={s ? `/embarques/${s.id}` : "/costos"} className="flex items-center gap-2 text-sm text-ink-secondary hover:text-ink-primary">
          <ArrowLeft size={16} />
          {s ? "Volver a la unidad" : "Volver a costos"}
        </Link>
        <div className="flex items-center gap-3">
          {order.erpEnviado ? (
            <span className="text-xs text-brand-blue-700 bg-brand-blue-50 rounded-full px-3 py-1">
              Sincronizada con ERP
            </span>
          ) : (
            <span
              className="text-xs text-red-600 bg-red-50 rounded-full px-3 py-1"
              title={order.erpError ?? "Aún no se ha enviado al ERP"}
            >
              No sincronizada con ERP
            </span>
          )}
          {!soloLectura && !order.erpEnviado && order.estatusPago === "Pendiente" && (
            <form action={reintentarEnvioERP.bind(null, order.id)}>
              <SubmitButton pendingText="Enviando al ERP…" className="rounded-lg border border-border text-sm px-4 py-2 hover:bg-surface-muted">
                Reintentar envío a ERP
              </SubmitButton>
            </form>
          )}
          {!soloLectura && order.estatusPago === "Pendiente" && (
            <form action={cancelarOrdenDePago.bind(null, order.id)}>
              <ConfirmSubmitButton
                confirmText={`¿Cancelar la orden ${order.folio}? Se cancela también en el ERP; si Finanzas ya la pagó, no se podrá.`}
                className="rounded-lg border border-border text-sm px-4 py-2 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
              >
                Cancelar orden
              </ConfirmSubmitButton>
            </form>
          )}
          {!soloLectura && order.estatusPago === "Cancelada" && (
            <form action={eliminarOrdenDePago.bind(null, order.id)}>
              <ConfirmSubmitButton
                confirmText={`¿Eliminar la orden cancelada ${order.folio}? Dejará de mostrarse en las listas.`}
                className="rounded-lg border border-border text-sm px-4 py-2 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
              >
                Eliminar
              </ConfirmSubmitButton>
            </form>
          )}
          <PrintButton />
        </div>
      </div>

      {admin && order.estatusPago === "Pendiente" && (
        <form
          action={marcarOrdenPagadaManual.bind(null, order.id)}
          className="no-print max-w-3xl mx-auto mt-6 rounded-lg border border-border bg-white px-4 py-3 flex flex-wrap items-end gap-3 text-sm"
        >
          <div className="flex-1 min-w-48">
            <p className="font-medium text-ink-primary">Marcar como pagada (a mano)</p>
            <p className="text-xs text-ink-muted">Solo administrador. Queda registrado y, cuando Finanzas confirme en el ERP, se reemplaza solo.</p>
          </div>
          <label className="flex flex-col gap-1 text-xs text-ink-secondary">
            Fecha de pago
            <input type="date" name="fechaPago" className="rounded-lg border border-border px-3 py-1.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-secondary">
            Referencia (opcional)
            <input name="referenciaBancaria" maxLength={100} className="rounded-lg border border-border px-3 py-1.5 text-sm" />
          </label>
          <ConfirmSubmitButton
            confirmText={`¿Marcar la orden ${order.folio} como pagada? Se hace a mano, sin confirmación del ERP.`}
            className="rounded-lg bg-brand-navy text-white text-sm font-medium px-4 py-2"
          >
            Marcar pagada
          </ConfirmSubmitButton>
        </form>
      )}
      {admin && order.estatusPago === "Pagado" && order.erpPago === "MANUAL" && (
        <div className="no-print max-w-3xl mx-auto mt-6 rounded-lg bg-brand-orange-100 text-brand-orange-700 px-4 py-3 flex items-center justify-between gap-3 text-sm">
          <span>Pago marcado a mano; Finanzas aún no lo confirma en el ERP.</span>
          <form action={quitarPagoManual.bind(null, order.id)}>
            <ConfirmSubmitButton confirmText={`¿Quitar el pago manual de ${order.folio} y dejarla pendiente?`} className="rounded-lg border border-current text-xs px-3 py-1.5">
              Quitar pago manual
            </ConfirmSubmitButton>
          </form>
        </div>
      )}

      {(order.erpError || order.erpAviso || order.estatusPago === "Pendiente") && (
        <div className="no-print max-w-3xl mx-auto mt-6 space-y-2 text-sm">
          {order.erpError && (
            <p className="rounded-lg bg-red-50 text-red-700 px-4 py-2.5">{order.erpError}</p>
          )}
          {order.erpAviso && (
            <p className="rounded-lg bg-brand-orange-100 text-brand-orange-700 px-4 py-2.5">Aviso del ERP: {order.erpAviso}</p>
          )}
          {order.estatusPago === "Pendiente" && (
            <p className="text-ink-muted px-1">
              El pago lo confirma Finanzas desde el ERP; en cuanto lo valide, esta orden pasa sola a pagadas.
            </p>
          )}
        </div>
      )}

      <div className="max-w-3xl mx-auto bg-white shadow-sm print:shadow-none my-8 print:my-0 p-10 print:p-5 print:text-sm">
        <div className="flex items-start justify-between border-b-4 border-brand-navy pb-6 mb-6 print:pb-3 print:mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-10 w-10 rounded-lg bg-brand-orange-500 flex items-center justify-center font-bold text-white">
                MH
              </div>
              <div>
                <p className="font-semibold text-lg text-ink-primary leading-tight">MH Logística</p>
                <p className="text-xs text-ink-muted leading-tight">Machinery Hunters</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-ink-muted">Orden de pago</p>
            <p className="text-xl font-bold text-brand-navy">{order.folio}</p>
            <p className="text-xs text-ink-muted mt-1">{formatFecha(order.fechaGenerada)}</p>
            {order.concepto && <p className="text-sm font-medium text-ink-primary mt-1">{order.concepto}</p>}
            <span
              className={`inline-block mt-2 text-xs font-medium rounded-full px-3 py-1 ${
                order.estatusPago === "Pagado"
                  ? "bg-brand-blue-100 text-brand-blue-900"
                  : order.estatusPago === "Cancelada"
                    ? "bg-gray-200 text-gray-500 line-through"
                    : "bg-brand-orange-100 text-brand-orange-700"
              }`}
            >
              {order.estatusPago}
            </span>
          </div>
        </div>

        <div className="flex gap-6 mb-8 print:mb-4">
          {s && (
            <FotoMini src={fotoSrc(s, "full")} alt={s.equipoDescripcion} className="w-32 h-32 print:w-20 print:h-20 object-cover rounded-lg border border-border shrink-0" />
          )}
          <div className="grid grid-cols-2 gap-6 text-sm flex-1">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-muted mb-1">Requisición para</p>
              <p className="font-medium text-ink-primary">Administración — Machinery Hunters</p>
              <p className="text-ink-secondary mt-2">
                Solicitada por: <span className="font-medium text-ink-primary">{order.generadaPor ?? "—"}</span>
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-muted mb-1">
                {s ? "Unidad / Embarque" : "Tipo de gasto"}
              </p>
              {s ? (
                <>
                  <p className="font-medium text-ink-primary">{s.equipoDescripcion}</p>
                  <p className="text-ink-secondary">
                    Cliente: {s.cliente} · Serie: {s.serie}
                  </p>
                  <p className="text-ink-secondary">
                    Folio interno: {s.folio} {s.aduana ? `· Aduana: ${s.aduana}` : ""}
                  </p>
                </>
              ) : (
                <p className="font-medium text-ink-primary">
                  Gasto general — no ligado a ninguna unidad en particular
                </p>
              )}
            </div>
          </div>
        </div>

        <table className="w-full text-sm mb-6 print:mb-3">
          <thead>
            <tr className="border-b-2 border-brand-navy text-left">
              <th className="py-2 text-ink-secondary font-medium">Concepto</th>
              <th className="py-2 text-ink-secondary font-medium text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.label} className="border-b border-border">
                <td className="py-2.5 text-ink-primary">{l.label}</td>
                <td className="py-2.5 text-right text-ink-primary">{formatMXN(l.valor)}</td>
              </tr>
            ))}
            {order.detalleFleteUSA && (
              <tr className="border-b border-border">
                <td colSpan={2} className="pb-2.5 pt-0.5 text-xs text-ink-muted">
                  Flete USA incluye: {order.detalleFleteUSA.replaceAll(" | ", " · ")}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-4 font-semibold text-ink-primary">Total a pagar (USD)</td>
              <td className="pt-4 text-right font-bold text-lg text-brand-navy">{formatMXN(order.total)}</td>
            </tr>
          </tfoot>
        </table>

        {order.tipoCambio && order.tipoCambio > 0 && (
          <div className="mb-8 print:mb-4 rounded-xl bg-brand-blue-50 border border-brand-blue-100 p-5 print:p-3 text-center">
            <p className="text-xs uppercase tracking-wide text-ink-muted mb-1">
              Total en pesos mexicanos · T.C. {order.tipoCambio.toFixed(2)}
            </p>
            <p className="text-4xl print:text-2xl font-extrabold text-brand-navy">{formatPesos(order.total * order.tipoCambio)}</p>
          </div>
        )}

        {(order.proveedorNombre || order.monedaCuenta || order.banco || order.numeroCuenta || order.clabe || order.titular) && (
          <div className="mb-8 print:mb-4 text-sm border border-border rounded-lg p-4 print:p-3">
            <p className="text-xs uppercase tracking-wide text-ink-muted mb-2 font-semibold">Datos bancarios para el pago</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {order.proveedorNombre && (
                <p className="col-span-2">
                  <span className="text-ink-muted">Proveedor: </span>
                  <span className="text-ink-primary font-medium">{order.proveedorNombre}</span>
                  {order.proveedorId && !order.proveedorId.startsWith("LOG-") && <span className="text-ink-muted"> ({order.proveedorId})</span>}
                </p>
              )}
              {order.monedaCuenta && (
                <p>
                  <span className="text-ink-muted">Cuenta en: </span>
                  <span className="text-ink-primary font-medium">
                    {order.monedaCuenta === "USD" ? "Dólares (USD)" : "Pesos (MXN)"}
                  </span>
                </p>
              )}
              {order.banco && (
                <p>
                  <span className="text-ink-muted">Banco: </span>
                  <span className="text-ink-primary font-medium">{order.banco}</span>
                </p>
              )}
              {order.direccionBanco && (
                <p>
                  <span className="text-ink-muted">Dirección del banco: </span>
                  <span className="text-ink-primary font-medium">{order.direccionBanco}</span>
                </p>
              )}
              {order.numeroCuenta && (
                <p>
                  <span className="text-ink-muted">Número de cuenta: </span>
                  <span className="text-ink-primary font-medium">{order.numeroCuenta}</span>
                </p>
              )}
              {order.clabe && (
                <p>
                  <span className="text-ink-muted">CLABE / IBAN: </span>
                  <span className="text-ink-primary font-medium">{order.clabe}</span>
                </p>
              )}
              {order.titular && (
                <p>
                  <span className="text-ink-muted">Titular: </span>
                  <span className="text-ink-primary font-medium">{order.titular}</span>
                </p>
              )}
              {order.swift && (
                <p>
                  <span className="text-ink-muted">SWIFT: </span>
                  <span className="text-ink-primary font-medium">{order.swift}</span>
                </p>
              )}
              {order.routing && (
                <p>
                  <span className="text-ink-muted">Routing (ABA): </span>
                  <span className="text-ink-primary font-medium">{order.routing}</span>
                </p>
              )}
              {order.sucursal && (
                <p>
                  <span className="text-ink-muted">Sucursal: </span>
                  <span className="text-ink-primary font-medium">{order.sucursal}</span>
                </p>
              )}
              {order.direccionTitular && (
                <p>
                  <span className="text-ink-muted">Dirección del titular: </span>
                  <span className="text-ink-primary font-medium">{order.direccionTitular}</span>
                </p>
              )}
            </div>
          </div>
        )}

        {order.estatusPago === "Pagado" && (order.fechaPago || order.erpPago || order.referenciaBancaria) && (
          <div className="mb-8 print:mb-4 text-sm rounded-lg bg-brand-blue-50 p-4 print:p-3">
            <p className="text-xs uppercase tracking-wide text-ink-muted mb-2 font-semibold">{order.erpPago === "MANUAL" ? "Pago marcado a mano" : "Pago confirmado por Finanzas"}</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {order.fechaPago && (
                <p>
                  <span className="text-ink-muted">Fecha de pago: </span>
                  <span className="text-ink-primary font-medium">{formatFecha(order.fechaPago)}</span>
                </p>
              )}
              {order.montoPagado != null && (
                <p>
                  <span className="text-ink-muted">Monto pagado: </span>
                  <span className="text-ink-primary font-medium">
                    {order.monedaPago === "MXN" ? formatPesos(order.montoPagado) : formatMXN(order.montoPagado)} {order.monedaPago ?? ""}
                  </span>
                </p>
              )}
              {order.erpPago && order.erpPago !== "MANUAL" && (
                <p>
                  <span className="text-ink-muted">Pago en ERP: </span>
                  <span className="text-ink-primary font-medium">{order.erpPago}</span>
                </p>
              )}
              {order.referenciaBancaria && (
                <p>
                  <span className="text-ink-muted">Referencia bancaria: </span>
                  <span className="text-ink-primary font-medium">{order.referenciaBancaria}</span>
                </p>
              )}
            </div>
          </div>
        )}

        {order.notas && (
          <div className="mb-8 print:mb-4 text-sm">
            <p className="text-xs uppercase tracking-wide text-ink-muted mb-1">Notas</p>
            <p className="text-ink-primary">{order.notas}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-10 mt-16 pt-8 print:mt-8 print:pt-3">
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2">
              <p className="text-sm font-medium text-ink-primary">Gabriel Buchanan</p>
              <p className="text-xs text-ink-muted">Gte. General — Dirección</p>
            </div>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 pt-2">
              <p className="text-sm font-medium text-ink-primary">Perla Sanchez</p>
              <p className="text-xs text-ink-muted">Jefa de Admón — Administración</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
