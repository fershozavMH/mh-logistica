"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import type { OpcionProveedor } from "@/lib/erp";

// Proveedor y cuenta bancaria para la orden de pago, elegidos del catálogo
// del ERP (log_proveedores). Ya no se captura CLABE ni número de cuenta a
// mano: el navegador solo ve los últimos 4 dígitos y manda el id de la
// cuenta; los datos completos los copia el servidor del catálogo.
export default function ProveedorCuentaSelect({
  opciones,
  ultimaSync,
  errorSync,
  accionActualizar,
}: {
  opciones: OpcionProveedor[];
  ultimaSync: string | null;
  errorSync: string | null;
  accionActualizar: () => Promise<void>;
}) {
  const [proveedorId, setProveedorId] = useState("");
  const proveedor = opciones.find((p) => p.id === proveedorId);
  const cuentaInicial = proveedor?.cuentas.find((c) => c.predeterminada) ?? proveedor?.cuentas[0];
  const [cuentaId, setCuentaId] = useState("");
  const cuenta = proveedor?.cuentas.find((c) => c.id === cuentaId) ?? cuentaInicial;
  const [moneda, setMoneda] = useState<string>("");
  const monedaMostrada = moneda || cuenta?.moneda || "MXN";
  const [manual, setManual] = useState(opciones.length === 0);

  return (
    <div className="space-y-3">
      {opciones.length === 0 && (
        <p className="text-sm text-brand-orange-700 bg-brand-orange-100 rounded-lg px-3 py-2">
          No hay proveedores del ERP en el catálogo todavía.
          {errorSync ? ` Último error: ${errorSync}` : ""} Mientras tanto puedes capturar el proveedor y su cuenta a mano.
        </p>
      )}
      <label className="flex items-center gap-2 text-sm text-ink-secondary">
        <input type="checkbox" checked={manual} onChange={(e) => setManual(e.target.checked)} />
        El proveedor no está en el catálogo: capturar a mano
      </label>
      {manual && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border p-3">
          <input type="hidden" name="modoManual" value="1" />
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-ink-secondary">Proveedor</span>
            <input name="proveedorNombre" required maxLength={200} className="rounded-lg border border-border px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-secondary">Titular de la cuenta</span>
            <input name="titular" maxLength={200} className="rounded-lg border border-border px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-secondary">Banco</span>
            <input name="banco" maxLength={120} className="rounded-lg border border-border px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-secondary">Número de cuenta</span>
            <input name="numeroCuenta" maxLength={60} className="rounded-lg border border-border px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-secondary">CLABE interbancaria</span>
            <input name="clabe" maxLength={60} className="rounded-lg border border-border px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-secondary">SWIFT (opcional)</span>
            <input name="swift" maxLength={40} className="rounded-lg border border-border px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-secondary">Routing (opcional)</span>
            <input name="routing" maxLength={40} className="rounded-lg border border-border px-3 py-2 text-sm" />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-secondary sm:col-span-2">
            <input type="checkbox" name="guardarProveedor" defaultChecked />
            Guardar este proveedor para próximas órdenes
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-ink-secondary">Moneda de la cuenta</span>
            <select name="monedaCuenta" defaultValue="MXN" className="rounded-lg border border-border px-3 py-2 text-sm">
              <option value="MXN">Cuenta en pesos (MXN)</option>
              <option value="USD">Cuenta en dólares (USD)</option>
            </select>
          </label>
        </div>
      )}
      {!manual && opciones.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-ink-secondary">Proveedor (catálogo del ERP)</span>
            <select
              name="proveedorId"
              required
              value={proveedorId}
              onChange={(e) => {
                setProveedorId(e.target.value);
                setCuentaId("");
                setMoneda("");
              }}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              <option value="">Elige un proveedor…</option>
              {opciones.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-secondary">Cuenta bancaria</span>
            <select
              name="cuentaId"
              required
              disabled={!proveedor}
              value={cuenta?.id ?? ""}
              onChange={(e) => {
                setCuentaId(e.target.value);
                setMoneda("");
              }}
              className="rounded-lg border border-border px-3 py-2 text-sm disabled:bg-surface-muted"
            >
              {!proveedor && <option value="">Primero elige el proveedor</option>}
              {proveedor && proveedor.cuentas.length === 0 && <option value="">Sin cuentas registradas en el ERP</option>}
              {proveedor?.cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.etiqueta || "Cuenta sin datos"}
                  {c.predeterminada ? " (predeterminada)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-ink-secondary">Moneda de la cuenta</span>
            <select
              name="monedaCuenta"
              value={monedaMostrada}
              onChange={(e) => setMoneda(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              <option value="MXN">Cuenta en pesos (MXN)</option>
              <option value="USD">Cuenta en dólares (USD)</option>
            </select>
          </label>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
        <span>
          {ultimaSync ? `Catálogo actualizado: ${ultimaSync}` : "El catálogo no se ha sincronizado"}
          {errorSync && opciones.length > 0 ? " (el último intento falló)" : ""}
        </span>
        <button
          type="submit"
          formAction={accionActualizar}
          formNoValidate
          className="flex items-center gap-1 text-brand-blue-700 hover:underline"
        >
          <RefreshCw size={12} />
          Actualizar catálogo
        </button>
      </div>
    </div>
  );
}
