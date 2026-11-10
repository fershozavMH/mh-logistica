import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthRole } from "@/lib/auth-server";
import { respuestaFoto } from "@/lib/imagenes";

// Foto de una cotización (requiere sesión). Sin versión: caché corta.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getAuthRole())) return new Response("No autorizado", { status: 401 });
  const { id } = await ctx.params;
  const tamano = req.nextUrl.searchParams.get("t") === "thumb" ? "thumb" : "full";
  const c = await prisma.cotizacion.findUnique({ where: { id }, select: { fotoUrl: true } });
  return respuestaFoto(c?.fotoUrl, tamano, "corta");
}
