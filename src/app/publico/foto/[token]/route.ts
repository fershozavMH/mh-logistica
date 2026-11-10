import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { respuestaFoto } from "@/lib/imagenes";
import { tokenPublicoValido } from "@/lib/foto-url";

// Foto para la ficha pública de una unidad, sin sesión. Se busca por el
// token público de la unidad (el mismo del link que se manda al cliente),
// no por su id, así que solo la ve quien tiene ese link.
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!tokenPublicoValido(token)) return new Response("No encontrada", { status: 404 });
  const tamano = req.nextUrl.searchParams.get("t") === "full" ? "full" : "thumb";
  const s = await prisma.shipment.findUnique({ where: { tokenPublico: token }, select: { fotoUrl: true } });
  return respuestaFoto(s?.fotoUrl, tamano, req.nextUrl.searchParams.has("v") ? "publica" : "corta");
}
