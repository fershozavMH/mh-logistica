import { NextRequest } from "next/server";
import { tokenPublicoValido } from "@/lib/foto-url";
import { respuestaFotoUnidad } from "@/lib/foto-unidad";

// Foto para la ficha pública de una unidad, sin sesión. Se busca por el
// token público de la unidad (el mismo del link que se manda al cliente),
// no por su id, así que solo la ve quien tiene ese link.
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!tokenPublicoValido(token)) return new Response("No encontrada", { status: 404 });
  const tamano = req.nextUrl.searchParams.get("t") === "full" ? "full" : "thumb";
  return respuestaFotoUnidad({ tokenPublico: token }, tamano, req.nextUrl.searchParams.has("v") ? "publica" : "corta");
}
