import { NextRequest } from "next/server";
import { getAuthRole } from "@/lib/auth-server";
import { respuestaFotoUnidad } from "@/lib/foto-unidad";

// Foto de un equipo para pantallas internas (requiere sesión).
// ?t=thumb (160 px, listas) | full (1200 px, detalle). ?v= versión para caché.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getAuthRole())) return new Response("No autorizado", { status: 401 });
  const { id } = await ctx.params;
  const tamano = req.nextUrl.searchParams.get("t") === "full" ? "full" : "thumb";
  return respuestaFotoUnidad({ id }, tamano, req.nextUrl.searchParams.has("v") ? "privada" : "corta");
}
