"use client";

import { useState } from "react";
import { Link2, Check } from "lucide-react";

// Botón para copiar el link público de seguimiento de UNA unidad (sin clave
// de acceso), para que Jaime se lo mande directo al cliente dueño de ese
// equipo por WhatsApp/correo. El link se arma con window.location.origin en
// el momento del clic (no hace falta guardar la URL del sitio en ningún
// lado) — por eso es "use client".
export default function CopyLinkButton({ tokenPublico }: { tokenPublico: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    const url = `${window.location.origin}/publico/unidad/${tokenPublico}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copia el link:", url);
      return;
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <button
      onClick={copiar}
      type="button"
      title="Copiar link de seguimiento para mandarle al cliente"
      className={`no-print flex items-center gap-1.5 rounded-lg border text-xs font-medium px-2.5 py-1.5 shrink-0 ${
        copiado
          ? "border-brand-blue-200 bg-brand-blue-50 text-brand-blue-700"
          : "border-border text-ink-secondary hover:bg-surface-muted"
      }`}
    >
      {copiado ? <Check size={13} /> : <Link2 size={13} />}
      {copiado ? "¡Copiado!" : "Link para cliente"}
    </button>
  );
}
