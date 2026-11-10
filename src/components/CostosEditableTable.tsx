"use client";

import FotoMini from "@/components/FotoMini";
import { fotoSrc } from "@/lib/foto-url";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Check, X } from "lucide-react";
import { updateShipmentCosts } from "@/lib/actions";
import { formatMXN } from "@/lib/constants";
import { SerieTag, ClockBadge, MoneyInput } from "@/components/ui";

export interface FilaCosto {
  id: string;
  folio: string;
  equipoDescripcion: string;
  updatedAt: Date | string;
  serie: string;
  fechaInicio: Date | null;
  fechaEntrega: Date | null;
  tiempoCicloDias: number | null;
  fleteMexAplica: boolean;
  costoFleteUSA: number;
  costoImportacion: number;
  costoBondCanada: number;
  costoManiobras: number;
  costoFleteMx: number;
  costoPermiso: number;
  costoSeguro: number;
  costoPlacas: number;
  costoRepuveTitulo: number;
  tieneGastosFleteUSA?: boolean;
}

const CAMPOS: { key: keyof FilaCosto; label: string }[] = [
  { key: "costoFleteUSA", label: "Flete USA" },
  { key: "costoImportacion", label: "Importación" },
  { key: "costoManiobras", label: "Maniobra/Reparación" },
  { key: "costoFleteMx", label: "Flete Mx" },
  { key: "costoPermiso", label: "Permiso" },
  { key: "costoSeguro", label: "Seguro" },
  { key: "costoPlacas", label: "Placas" },
  { key: "costoRepuveTitulo", label: "Repuve/Título" },
];

export default function CostosEditableTable({
  shipments,
  soloLectura = false,
}: {
  shipments: FilaCosto[];
  soloLectura?: boolean;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function startEdit(s: FilaCosto) {
    setEditId(s.id);
    setForm({
      costoFleteUSA: String(s.costoFleteUSA),
      costoImportacion: String(s.costoImportacion),
      costoManiobras: String(s.costoManiobras),
      costoFleteMx: String(s.costoFleteMx),
      costoPermiso: String(s.costoPermiso),
      costoSeguro: String(s.costoSeguro),
      costoPlacas: String(s.costoPlacas),
      costoRepuveTitulo: String(s.costoRepuveTitulo),
    });
  }

  function cancelar() {
    setEditId(null);
    setForm({});
  }

  function guardar(s: FilaCosto) {
    const fd = new FormData();
    for (const campo of CAMPOS) fd.set(campo.key, form[campo.key] ?? "0");
    if (s.fleteMexAplica) fd.set("fleteMexAplica", "on");
    setError(null);
    startTransition(async () => {
      try {
        await updateShipmentCosts(s.id, fd);
        setEditId(null);
      } catch {
        setError("No se pudo guardar. Revisa tu conexión e intenta de nuevo.");
      }
    });
  }

  return (
    <div className="overflow-x-auto">
      {error && <p className="px-5 py-2 text-xs text-red-600 bg-red-50">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-muted border-b border-border">
            <th className="px-5 py-2.5 font-medium">Unidad</th>
            <th className="px-5 py-2.5 font-medium">Serie</th>
            <th className="px-5 py-2.5 font-medium">Tiempo</th>
            {CAMPOS.map((c) => (
              <th key={c.key} className="px-5 py-2.5 font-medium text-right">
                {c.label}
              </th>
            ))}
            <th className="px-5 py-2.5 font-medium text-right">Total</th>
            <th className="px-5 py-2.5 font-medium text-right"></th>
          </tr>
        </thead>
        <tbody>
          {shipments.map((s) => {
            const editando = editId === s.id;
            const total =
              s.costoFleteUSA + s.costoImportacion + s.costoBondCanada + s.costoManiobras + s.costoFleteMx + s.costoPermiso + s.costoSeguro + s.costoPlacas + s.costoRepuveTitulo;
            return (
              <tr key={s.id} className={`border-b border-border last:border-0 ${editando ? "bg-brand-blue-50" : "hover:bg-surface-muted"}`}>
                <td className="px-5 py-2.5">
                  <Link href={`/embarques/${s.id}`} className="flex items-center gap-2.5">
                    <FotoMini src={fotoSrc(s, "thumb")} alt="" className="w-9 h-9 rounded-md object-cover shrink-0 border border-border" fallbackClassName="w-9 h-9 rounded-md bg-gray-100 shrink-0" />
                    <span>
                      <span className="block text-ink-primary hover:text-brand-blue-700 font-medium">{s.equipoDescripcion}</span>
                      <span className="block text-xs text-ink-muted">{s.folio}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-5 py-2.5">
                  <SerieTag serie={s.serie} />
                </td>
                <td className="px-5 py-2.5">
                  <ClockBadge fechaInicio={s.fechaInicio} fechaEntrega={s.fechaEntrega} tiempoCicloDias={s.tiempoCicloDias} />
                </td>
                {CAMPOS.map((c) => (
                  <td key={c.key} className="px-5 py-2.5 text-right">
                    {editando && !(c.key === "costoFleteUSA" && s.tieneGastosFleteUSA) ? (
                      <MoneyInput
                        value={form[c.key] ?? "0"}
                        onChange={(v) => setForm((f) => ({ ...f, [c.key]: v }))}
                        className="w-24 rounded-md border border-border px-2 py-1 text-right text-sm"
                      />
                    ) : c.key === "costoFleteUSA" && s.tieneGastosFleteUSA ? (
                      <span title="Se administra por gastos individuales en la ficha de la unidad">
                        {formatMXN(s[c.key] as number)}
                      </span>
                    ) : (
                      formatMXN(s[c.key] as number)
                    )}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right font-semibold text-ink-primary">{formatMXN(total)}</td>
                <td className="px-5 py-2.5 text-right">
                  {soloLectura ? null : editando ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => guardar(s)}
                        disabled={pending}
                        title="Guardar"
                        className="rounded-md bg-brand-blue-600 hover:bg-brand-blue-700 disabled:opacity-60 text-white p-1.5"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={cancelar}
                        disabled={pending}
                        title="Cancelar"
                        className="rounded-md border border-border text-ink-secondary p-1.5 hover:bg-surface-muted"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(s)}
                      title="Editar costos"
                      className="rounded-md border border-border text-ink-secondary p-1.5 hover:bg-surface-muted hover:text-brand-blue-700"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
