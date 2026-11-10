// URLs de las fotos (se pueden usar en servidor y en cliente).
// `v` cambia cuando cambia el equipo, así el navegador no muestra una foto
// vieja aunque la respuesta se cachee por un año.
type ConFoto = { id: string; updatedAt: Date | string };

const version = (d: Date | string) => new Date(d).getTime().toString(36);

export function fotoSrc(s: ConFoto, tamano: "thumb" | "full" = "thumb") {
  return `/api/foto/${encodeURIComponent(s.id)}?t=${tamano}&v=${version(s.updatedAt)}`;
}

// Token del link público de una unidad: 64 caracteres hexadecimales.
export const tokenPublicoValido = (t: string | undefined): t is string => !!t && /^[0-9a-f]{64}$/.test(t);

export function fotoPublicaSrc(s: { tokenPublico: string; updatedAt: Date | string }, tamano: "thumb" | "full" = "thumb") {
  return `/publico/foto/${s.tokenPublico}?t=${tamano}&v=${version(s.updatedAt)}`;
}


// Cotizacion no tiene updatedAt: su ruta se cachea poco tiempo (ver route.ts).
export function cotizacionFotoSrc(c: { id: string }, tamano: "thumb" | "full" = "full") {
  return `/api/foto/cotizacion/${encodeURIComponent(c.id)}?t=${tamano}`;
}
