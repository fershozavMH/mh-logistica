"use client";

import { useState } from "react";

// Foto de un equipo servida por /api/foto (o /publico/foto). Si el equipo no
// tiene foto la ruta responde 404 y se muestra el recuadro gris de siempre
// (o nada, si no se pasa fallbackClassName).
export default function FotoMini({
  src,
  alt = "",
  className,
  fallbackClassName,
}: {
  src: string;
  alt?: string;
  className: string;
  fallbackClassName?: string;
}) {
  const [fallo, setFallo] = useState(false);
  if (fallo) return fallbackClassName ? <div className={fallbackClassName} /> : null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={className} onError={() => setFallo(true)} />;
}
