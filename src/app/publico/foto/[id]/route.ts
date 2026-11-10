import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { respuestaFoto } from "@/lib/imagenes";

// Foto para las vistas públicas (/publico/*), sin sesión, como esas páginas.
// Se puede cachear en la CDN de Vercel (no pasa por la función cada vez).
// Pendiente (Bloque B del plan): exigir el token público de la unidad.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tamano = req.nextUrl.searchParams.get("t") === "full" ? "full" : "thumb";
  const s = await prisma.shipment.findUnique({ where: { id }, select: { fotoUrl: true } });
  return respuestaFoto(s?.fotoUrl, tamano, req.nextUrl.searchParams.has("v") ? "publica" : "corta");
}
