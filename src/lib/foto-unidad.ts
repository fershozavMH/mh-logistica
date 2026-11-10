import { prisma } from "@/lib/prisma";
import {
  decodificarDataUrl,
  generarMiniatura,
  respuestaFoto,
  respuestaWebp,
  sinFoto,
  type CacheFoto,
} from "@/lib/imagenes";

// Foto de una unidad para las rutas /api/foto/[id] y /publico/foto/[token].
//
// "full": se lee la foto guardada y se manda (ya viene en WebP de 1200 px).
// "thumb": se usa la miniatura guardada en Shipment.fotoThumb (~4 KB). La
// primera vez que se pide una miniatura de una unidad se genera con sharp
// (~130 ms), se guarda y las siguientes ya no procesan nada ni leen la foto
// completa. Al cambiar o quitar la foto se borra fotoThumb (ver actions.ts y
// la ruta de unidades del ERP) y se vuelve a generar sola.
export async function respuestaFotoUnidad(
  where: { id: string } | { tokenPublico: string },
  tamano: "thumb" | "full",
  cache: CacheFoto,
) {
  if (tamano === "full") {
    const s = await prisma.shipment.findUnique({ where, select: { fotoUrl: true } });
    return respuestaFoto(s?.fotoUrl, "full", cache);
  }

  const guardada = await prisma.shipment.findUnique({
    where,
    select: { id: true, updatedAt: true, fotoThumb: true },
  });
  if (!guardada) return sinFoto();
  const buf = guardada.fotoThumb ? decodificarDataUrl(guardada.fotoThumb) : null;
  if (buf) return respuestaWebp(buf, cache);

  const origen = await prisma.shipment.findUnique({ where: { id: guardada.id }, select: { fotoUrl: true } });
  const miniatura = await generarMiniatura(origen?.fotoUrl);
  if (!miniatura) return sinFoto();

  // Se guarda sin mover updatedAt (de él depende ?v= de las URLs de fotos y la
  // huella de la TV) y solo si la unidad no cambió mientras se generaba.
  try {
    await prisma.shipment.updateMany({
      where: { id: guardada.id, updatedAt: guardada.updatedAt },
      data: { fotoThumb: `data:image/webp;base64,${miniatura.toString("base64")}`, updatedAt: guardada.updatedAt },
    });
  } catch (err) {
    console.error("[foto] no se pudo guardar la miniatura", err instanceof Error ? err.message : err);
  }
  return respuestaWebp(miniatura, cache);
}
