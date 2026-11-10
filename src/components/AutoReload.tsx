"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Mantiene al día una pantalla que se queda prendida sin que nadie la toque
// (ej. /reportes/pantalla).
//
// - Con `versionUrl`: cada `ms` pregunta una huella diminuta (~100 bytes) y
//   solo vuelve a pedir los datos completos si la huella cambió. Es lo que
//   evita gastar transferencia de Vercel cuando no hay novedades.
// - Sin `versionUrl`: refresca siempre cada `ms` (comportamiento anterior).
//
// Usa router.refresh() (solo pide los datos del servidor, no la página con
// sus archivos) y no hace nada mientras la pestaña está oculta. Cada
// `recargaCompletaMs` hace una recarga completa por si hubo un despliegue
// nuevo. Si la sesión se cerró (401), recarga para ir al login.
export default function AutoReload({
  ms,
  versionUrl,
  recargaCompletaMs = 6 * 60 * 60 * 1000,
}: {
  ms: number;
  versionUrl?: string;
  recargaCompletaMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    const inicio = Date.now();
    let ultima: string | null = null;
    let enCurso = false;

    const tick = async () => {
      if (document.visibilityState !== "visible" || enCurso) return;
      if (Date.now() - inicio >= recargaCompletaMs) {
        window.location.reload();
        return;
      }
      if (!versionUrl) {
        router.refresh();
        return;
      }
      enCurso = true;
      try {
        const res = await fetch(versionUrl, { cache: "no-store" });
        if (res.status === 401) {
          window.location.reload();
          return;
        }
        if (!res.ok) return;
        const { v } = (await res.json()) as { v: string };
        if (ultima !== null && v !== ultima) router.refresh();
        ultima = v;
      } catch {
        // sin red: se reintenta en el siguiente ciclo
      } finally {
        enCurso = false;
      }
    };

    // primera huella al abrir, para comparar contra ella
    if (versionUrl) void tick();
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  }, [ms, versionUrl, recargaCompletaMs, router]);

  return null;
}
