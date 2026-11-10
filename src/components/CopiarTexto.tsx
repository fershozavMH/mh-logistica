"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

// Copia un texto ya armado (p. ej. el link de activación de un usuario).
export default function CopiarTexto({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      window.prompt("Copia el link:", texto);
      return;
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }
  return (
    <button
      type="button"
      onClick={copiar}
      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy text-white text-xs font-medium px-3 py-2 hover:opacity-90"
    >
      {copiado ? <Check size={14} /> : <Copy size={14} />}
      {copiado ? "Copiado" : "Copiar link"}
    </button>
  );
}
