"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

// Botón de envío para formularios con acciones del servidor. Mientras la
// acción corre: se deshabilita (evita el doble clic que duplicaba registros),
// muestra un spinner y, si se pasa, el texto `pendingText` ("Guardando…").
export default function SubmitButton({
  children,
  pendingText,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      {...rest}
      disabled={pending || rest.disabled}
      aria-busy={pending || undefined}
      className={`${className} disabled:opacity-60 disabled:cursor-wait inline-flex items-center justify-center gap-1.5`}
    >
      {pending && <Loader2 size={14} className="animate-spin shrink-0" aria-hidden />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
