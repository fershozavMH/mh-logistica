import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthRole } from "@/lib/auth-server";
import { decodificarDataUrl } from "@/lib/imagenes";

// Descarga de un documento adjunto (factura, pedimento, BL...). Requiere sesión.
// Antes el archivo completo iba incrustado en la página de cada embarque.
const TIPOS_EN_LINEA = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await getAuthRole())) return new Response("No autorizado", { status: 401 });
  const { id } = await ctx.params;
  const d = await prisma.documento.findUnique({
    where: { id },
    select: { archivoUrl: true, nombre: true, tipo: true },
  });
  const buf = d ? decodificarDataUrl(d.archivoUrl, 20 * 1024 * 1024) : null;
  if (!d || !buf) return new Response("No encontrado", { status: 404 });

  const declarado = /^data:([^;,]+)/.exec(d.archivoUrl)?.[1] ?? d.tipo ?? "application/octet-stream";
  const enLinea = TIPOS_EN_LINEA.has(declarado) && req.nextUrl.searchParams.get("descargar") !== "1";
  const nombre = d.nombre.replace(/[^\w.\- áéíóúñÁÉÍÓÚÑ]/g, "_").slice(0, 100) || "documento";
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": TIPOS_EN_LINEA.has(declarado) ? declarado : "application/octet-stream",
      "Content-Disposition": `${enLinea ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
