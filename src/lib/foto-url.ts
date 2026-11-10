// URLs de las fotos (se pueden usar en servidor y en cliente).
// `v` cambia cuando cambia el equipo, así el navegador no muestra una foto
// vieja aunque la respuesta se cachee por un año.
type ConFoto = { id: string; updatedAt: Date | string };

const version = (d: Date | string) => new Date(d).getTime().toString(36);

export function fotoSrc(s: ConFoto, tamano: "thumb" | "full" = "thumb") {
  return `/api/foto/${encodeURIComponent(s.id)}?t=${tamano}&v=${version(s.updatedAt)}`;
}

export function fotoPublicaSrc(s: ConFoto, tamano: "thumb" | "full" = "thumb") {
  return `/publico/foto/${encodeURIComponent(s.id)}?t=${tamano}&v=${version(s.updatedAt)}`;
}

// Cotizacion no tiene updatedAt: su ruta se cachea poco tiempo (ver route.ts).
export function cotizacionFotoSrc(c: { id: string }, tamano: "thumb" | "full" = "full") {
  return `/api/foto/cotizacion/${encodeURIComponent(c.id)}?t=${tamano}`;
}
