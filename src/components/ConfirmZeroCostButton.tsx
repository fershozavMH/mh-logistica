"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

const CAMPOS_COSTO = ["costoFleteUSA", "costoImportacion", "costoBondCanada", "costoManiobras", "costoFleteMx", "costoPermiso", "costoSeguro", "costoPlacas", "costoRepuveTitulo"];

// Botón de "Generar orden de pago": si los conceptos de costo están en
// $0 (nadie los capturó todavía), avisa antes de generarla — para que no
// salga una orden en blanco sin que nadie se dé cuenta hasta imprimirla.
export default function ConfirmZeroCostButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className={`${className ?? ""} disabled:opacity-60 disabled:cursor-wait`}
      onClick={(e) => {
        const form = e.currentTarget.closest("form");
        if (!form) return;
        let total = CAMPOS_COSTO.reduce((suma, nombre) => {
          const el = form.elements.namedItem(nombre) as HTMLInputElement | null;
          const limpio = el ? el.value.replace(/[^0-9.-]/g, "") : "";
          const v = limpio ? Number(limpio) : 0;
          return suma + (Number.isFinite(v) ? v : 0);
        }, 0);
        // Cuando Flete USA viene desglosado en conceptos fijos (viáticos,
        // vuelos, seguro/permiso/placas...), no hay un campo "costoFleteUSA"
        // en este formulario — se suman las casillas marcadas en su lugar.
        form.querySelectorAll('input[name^="incluirFleteUSA_"]:checked').forEach((el) => {
          const v = Number((el as HTMLElement).dataset.monto ?? "0");
          if (Number.isFinite(v)) total += v;
        });
        if (total === 0) {
          const continuar = window.confirm(
            "Los conceptos de costo están en $0 — la orden saldría sin ningún monto. ¿Seguro que quieres generarla así?"
          );
          if (!continuar) e.preventDefault();
        }
      }}
    >
      {pending && <Loader2 size={16} className="animate-spin" aria-hidden />}
      {pending ? "Generando orden…" : children}
    </button>
  );
}
