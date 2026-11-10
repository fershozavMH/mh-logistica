import { Loader2 } from "lucide-react";

// Pantalla de carga mientras el servidor arma la página (aplica a todas las
// rutas). Antes no había ninguna y parecía que el clic no había hecho nada.
export default function Cargando() {
  return (
    <div className="h-full overflow-hidden p-6" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-ink-muted mb-6">
        <Loader2 size={16} className="animate-spin" aria-hidden />
        Cargando…
      </div>
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-1/3 rounded-lg bg-gray-200" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-gray-200" />
          ))}
        </div>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-gray-200" />
        ))}
      </div>
    </div>
  );
}
