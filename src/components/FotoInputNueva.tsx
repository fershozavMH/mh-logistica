"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";

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

// Igual que FotoEquipo, pero para un registro que AÚN NO existe (no hay id
// al que guardarle la foto de inmediato) — en vez de subirla sola, la deja
// lista en un input oculto para que se mande junto con el resto del
// formulario cuando se le dé "Guardar"/"Generar". Con defaultUrl también
// sirve para editar un registro que ya tiene foto: si no se elige una
// nueva, se manda la misma de siempre.
export default function FotoInputNueva({ name = "fotoUrl", defaultUrl }: { name?: string; defaultUrl?: string | null }) {
  const [preview, setPreview] = useState<string | null>(defaultUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setProcesando(true);
    try {
      const dataUrl = await comprimirImagen(file);
      setPreview(dataUrl);
    } catch {
      setError("No se pudo procesar esa imagen. Intenta con otra.");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
      <input type="hidden" name={name} value={preview ?? ""} />
      {preview ? (
        <div className="relative h-40 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Foto del equipo" className="w-full h-full object-cover rounded-xl border border-border" />
          <button
            type="button"
            onClick={() => setPreview(null)}
            title="Quitar foto"
            className="absolute top-2 right-2 rounded-lg bg-white/90 text-red-600 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={procesando}
          className="w-full h-40 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-ink-muted hover:border-brand-blue-400 hover:text-brand-blue-600 transition-colors"
        >
          {procesando ? <Loader2 size={22} className="animate-spin" /> : <Camera size={24} />}
          <span className="text-xs">{procesando ? "Procesando…" : "Subir foto del equipo"}</span>
        </button>
      )}
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  );
}
