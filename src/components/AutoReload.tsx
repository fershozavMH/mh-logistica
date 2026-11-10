"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Refresca los datos de la página sola cada `ms` milisegundos, para pantallas
// que se quedan prendidas sin que nadie las toque (ej. /reportes/pantalla).
// Usa router.refresh() (solo vuelve a pedir los datos del servidor, no toda
// la página con sus archivos) y no refresca mientras la pestaña está oculta.
// Cada `recargaCompletaMs` hace una recarga completa por si hubo un despliegue
// nuevo.
export default function AutoReload({
  ms,
  recargaCompletaMs = 6 * 60 * 60 * 1000,
}: {
  ms: number;
  recargaCompletaMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    const inicio = Date.now();
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - inicio >= recargaCompletaMs) window.location.reload();
      else router.refresh();
    }, ms);
    return () => clearInterval(id);
  }, [ms, recargaCompletaMs, router]);

  return null;
}
