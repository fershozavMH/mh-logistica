import sharp from "sharp";

// Procesamiento de fotos de equipos en el servidor.
// - Valida que el archivo sea de verdad una imagen (bytes mágicos), no solo
//   que el data URL diga "image/...".
// - Corrige la orientación del celular y descarta EXIF/GPS (sharp no copia
//   metadatos salvo que se le pida).
// - Convierte a WebP: "full" (1200 px) para guardar y ver en detalle, y
//   "thumb" (160 px) para listas, generada al vuelo por las rutas de foto.

export const ANCHO_FULL = 1200;
export const ANCHO_THUMB = 160;
const LIMITE_PIXELES = 40_000_000; // ~40 MP; evita que una imagen gigante tumbe la función
const LIMITE_BYTES = 8 * 1024 * 1024;

type Tipo = "jpeg" | "png" | "webp" | "gif" | "heif";

function tipoPorBytes(b: Buffer): Tipo | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (b.toString("ascii", 0, 3) === "GIF") return "gif";
  if (b.toString("ascii", 4, 8) === "ftyp") return "heif";
  return null;
}

export function decodificarDataUrl(dataUrl: string, maxBytes = LIMITE_BYTES): Buffer | null {
  const m = /^data:([a-z0-9.+/-]+)?(;base64)?,([\s\S]*)$/i.exec(dataUrl);
  if (!m || !m[2]) return null;
  try {
    const buf = Buffer.from(m[3], "base64");
    return buf.length > 0 && buf.length <= maxBytes ? buf : null;
  } catch {
    return null;
  }
}

export async function aWebp(buf: Buffer, ancho: number, calidad: number): Promise<Buffer> {
  return sharp(buf, { limitInputPixels: LIMITE_PIXELES, failOn: "error" })
    .rotate()
    .resize({ width: ancho, withoutEnlargement: true })
    .webp({ quality: calidad })
    .toBuffer();
}

// Normaliza una foto recibida (del navegador o del ERP) antes de guardarla.
// Devuelve un data URL WebP de máximo 1200 px, o lanza un error si no es una
// imagen válida.
export async function normalizarFoto(dataUrl: string | null | undefined): Promise<string | null> {
  if (!dataUrl) return null;
  const buf = decodificarDataUrl(dataUrl);
  const tipo = buf ? tipoPorBytes(buf) : null;
  if (!buf || !tipo) throw new Error("El archivo no es una imagen válida");
  // Ya normalizada (p. ej. al editar una cotización se reenvía la misma foto):
  // no volver a comprimir para no perder calidad en cada guardado.
  if (tipo === "webp") {
    const meta = await sharp(buf, { limitInputPixels: LIMITE_PIXELES }).metadata();
    if ((meta.width ?? Infinity) <= ANCHO_FULL && !meta.exif) return dataUrl;
  }
  const webp = await aWebp(buf, ANCHO_FULL, 80);
  return `data:image/webp;base64,${webp.toString("base64")}`;
}

const CACHE_CONTROL = {
  publica: "public, max-age=31536000, immutable",
  privada: "private, max-age=31536000, immutable",
  corta: "private, max-age=60",
} as const;
export type CacheFoto = keyof typeof CACHE_CONTROL;

export const sinFoto = () =>
  new Response("Sin foto", {
    status: 404,
    headers: { "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });

export function respuestaWebp(webp: Buffer, cache: CacheFoto) {
  return new Response(new Uint8Array(webp), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(webp.length),
      "Cache-Control": CACHE_CONTROL[cache],
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// Miniatura WebP de 160 px a partir de la foto guardada (data URL), o null si
// no es una imagen válida.
export async function generarMiniatura(dataUrl: string | null | undefined): Promise<Buffer | null> {
  const buf = dataUrl ? decodificarDataUrl(dataUrl) : null;
  if (!buf || !tipoPorBytes(buf)) return null;
  return aWebp(buf, ANCHO_THUMB, 70);
}

// Respuesta HTTP con la foto lista para el navegador. Se usa en las rutas
// /api/foto/[id] (con sesión) y /publico/foto/[token] (vista pública).
export async function respuestaFoto(
  dataUrl: string | null | undefined,
  tamano: "thumb" | "full",
  cache: CacheFoto,
) {
  const buf = dataUrl ? decodificarDataUrl(dataUrl) : null;
  const tipo = buf ? tipoPorBytes(buf) : null;
  if (!buf || !tipo) return sinFoto();

  // Las fotos guardadas ya salen en WebP de máximo 1200 px (normalizarFoto):
  // se mandan tal cual, sin volver a procesarlas en cada petición.
  if (tamano === "full" && tipo === "webp") {
    const meta = await sharp(buf, { limitInputPixels: LIMITE_PIXELES }).metadata();
    if ((meta.width ?? Infinity) <= ANCHO_FULL) return respuestaWebp(buf, cache);
  }
  const salida = await aWebp(buf, tamano === "thumb" ? ANCHO_THUMB : ANCHO_FULL, tamano === "thumb" ? 70 : 80);
  return respuestaWebp(salida, cache);
}
