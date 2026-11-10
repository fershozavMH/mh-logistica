"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Loader2, Pencil, X } from "lucide-react";
import { guardarFotoEquipo, quitarFotoEquipo } from "@/lib/actions";

const ANCHO_MAX = 1100;
const CALIDAD_JPEG = 0.82;

function comprimirImagen(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer la imagen"));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("No se pudo abrir la imagen"));
      img.onload = () => {
        const escala = Math.min(1, ANCHO_MAX / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("No se pudo procesar la imagen"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", CALIDAD_JPEG));
      };
      img.src = lector.result as string;
    };
    lector.readAsDataURL(file);
  });
}

export default function FotoEquipo({
  shipmentId,
  fotoUrl,
  compacto = false,
}: {
  shipmentId: string;
  fotoUrl: string | null;
  compacto?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(fotoUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await comprimirImagen(file);
      setPreview(dataUrl);
      startTransition(async () => {
        try {
          await guardarFotoEquipo(shipmentId, dataUrl);
        } catch {
          setError("No se pudo guardar la foto. Intenta de nuevo.");
        }
      });
    } catch {
      setError("No se pudo procesar esa imagen. Intenta con otra.");
    }
  }

  function quitar() {
    setPreview(null);
    startTransition(() => quitarFotoEquipo(shipmentId));
  }

  const alto = compacto ? "h-28" : "h-56 md:h-64";

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
      {preview ? (
        <div className={`relative ${alto} group`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Foto del equipo"
            className="w-full h-full object-cover rounded-xl border border-border"
            // la URL de /api/foto responde 404 si el equipo no tiene foto
            onError={() => setPreview((p) => (p?.startsWith("data:") ? p : null))}
          />
          <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-lg bg-white text-ink-primary text-xs font-medium px-3 py-1.5 flex items-center gap-1"
            >
              <Pencil size={12} />
              Cambiar
            </button>
            <button
              type="button"
              onClick={quitar}
              className="rounded-lg bg-white text-red-600 text-xs font-medium px-3 py-1.5 flex items-center gap-1"
            >
              <X size={12} />
              Quitar
            </button>
          </div>
          {pending && (
            <div className="absolute inset-0 rounded-xl bg-white/70 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin text-brand-blue-600" />
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className={`w-full ${alto} rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-ink-muted hover:border-brand-blue-400 hover:text-brand-blue-600 transition-colors`}
        >
          {pending ? <Loader2 size={22} className="animate-spin" /> : <Camera size={compacto ? 18 : 24} />}
          <span className="text-xs">{pending ? "Guardando…" : "Subir foto del equipo"}</span>
        </button>
      )}
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  );
}
