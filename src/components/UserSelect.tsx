"use client";

import { createContext, useContext } from "react";
import { UserRound } from "lucide-react";

// Antes aquí se elegía "quién eres" de una lista guardada en el navegador
// (cualquiera podía elegir a otra persona). Ahora el nombre sale de la
// sesión con correo, y el servidor registra ese mismo nombre en la bitácora
// sin importar lo que mande el formulario.
const SesionContext = createContext<string | null>(null);

export function SesionProvider({ nombre, children }: { nombre: string | null; children: React.ReactNode }) {
  return <SesionContext.Provider value={nombre}>{children}</SesionContext.Provider>;
}

export const useNombreSesion = () => useContext(SesionContext);

export default function UserSelect({ label, className }: { name?: string; label?: string; className?: string }) {
  const nombre = useNombreSesion();
  return (
    <div className={`flex flex-col gap-1 text-sm ${className ?? ""}`}>
      {label && <span className="text-ink-secondary">{label}</span>}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-ink-primary">
        <UserRound size={14} className="text-ink-muted shrink-0" />
        <span className="truncate">{nombre ?? "—"}</span>
      </div>
    </div>
  );
}

export function TopBarUserBadge() {
  const nombre = useNombreSesion();
  if (!nombre) return null;
  return (
    <div className="no-print flex items-center gap-2 rounded-full bg-surface-muted px-3 py-1.5 text-sm text-ink-secondary max-w-[14rem]">
      <span className="h-2 w-2 rounded-full bg-brand-orange-500 shrink-0" />
      <span className="truncate">{nombre}</span>
    </div>
  );
}
