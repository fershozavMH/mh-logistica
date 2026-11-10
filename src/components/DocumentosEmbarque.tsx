"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { guardarDocumento, eliminarDocumento } from "@/lib/actions";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

const TAMANO_MAX_MB = 10;

function leerComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer el archivo"));
    lector.onload = () => resolve(lector.result as string);
    lector.readAsDataURL(file);
  });
}

function formatFechaCorta(d: Date | string) {
  return new Date(d).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export type DocumentoItem = {
  id: string;
  nombre: string;
  tipo: string | null;
  createdAt: Date | string;
};

export default function DocumentosEmbarque({
  shipmentId,
  documentos,
  soloLectura = false,
}: {
  shipmentId: string;
  documentos: DocumentoItem[];
  soloLectura?: boolean;
}) {
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (file.size > TAMANO_MAX_MB * 1024 * 1024) {
      setError(`El archivo pesa más de ${TAMANO_MAX_MB}MB, intenta con uno más chico.`);
      return;
    }
    try {
      const dataUrl = await leerComoDataUrl(file);
      const etiqueta = nombre.trim() || file.name;
      startTransition(async () => {
        try {
          const fd = new FormData();
          fd.set("shipmentId", shipmentId);
          fd.set("nombre", etiqueta);
          fd.set("archivoUrl", dataUrl);
          fd.set("tipo", file.type);
          await guardarDocumento(fd);
          setNombre("");
        } catch {
          setError("No se pudo guardar el documento. Intenta de nuevo.");
        }
      });
    } catch {
      setError("No se pudo leer ese archivo. Intenta con otro.");
    }
  }

  return (
    <div className="space-y-3">
      {documentos.length === 0 ? (
        <p className="text-xs text-ink-muted">Sin documentos adjuntos todavía.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {documentos.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <a
                href={`/api/documento/${encodeURIComponent(d.id)}`}
                download={d.nombre}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 min-w-0 text-sm text-brand-blue-700 hover:underline"
              >
                <FileText size={16} className="shrink-0" />
                <span className="truncate">{d.nombre}</span>
              </a>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-ink-muted">{formatFechaCorta(d.createdAt)}</span>
                {!soloLectura && (
                  <form action={eliminarDocumento.bind(null, d.id, shipmentId)}>
                    <ConfirmSubmitButton
                      confirmText={`¿Eliminar "${d.nombre}"?`}
                      className="text-ink-muted hover:text-red-600 flex items-center"
                      title="Eliminar documento"
                    >
                      <X size={14} />
                    </ConfirmSubmitButton>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!soloLectura && (
        <>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Nombre (ej. Factura, Pedimento)"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="flex-1 rounded-lg border border-border px-2.5 py-1.5 text-xs"
            />
            <input ref={inputRef} type="file" accept="application/pdf,image/*" onChange={onFile} className="hidden" />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={pending}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-ink-secondary hover:bg-surface-muted flex items-center gap-1.5"
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
              {pending ? "Subiendo…" : "Subir"}
            </button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}
