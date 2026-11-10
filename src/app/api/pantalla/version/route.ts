import { prisma } from "@/lib/prisma";
import { getAuthRole } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

// Huella MUY pequeña de lo que muestra /reportes/pantalla (unidades, eventos
// de estatus y comentarios, más el día de hoy). La TV pregunta esto cada pocos
// minutos y solo vuelve a pedir la pantalla completa (130 KB o más) cuando la
// huella cambió; antes la pedía completa cada 10 minutos aunque no hubiera
// cambiado nada. Respuesta de ~100 bytes.
export async function GET() {
  if (!(await getAuthRole())) return new Response("No autorizado", { status: 401 });

  const [unidades, eventos, comentarios] = await Promise.all([
    prisma.shipment.aggregate({ _count: true, _max: { updatedAt: true } }),
    prisma.statusEvent.aggregate({ _count: true, _max: { fecha: true } }),
    prisma.comment.aggregate({ _count: true, _max: { createdAt: true } }),
  ]);
  // el día cambia con la hora de Baja California (los "días en proceso" y
  // "movimiento de hoy" dependen de él)
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Tijuana" }).format(new Date());
  const t = (d: Date | null) => (d ? d.getTime().toString(36) : "0");

  const v = [
    dia,
    unidades._count,
    t(unidades._max.updatedAt),
    eventos._count,
    t(eventos._max.fecha),
    comentarios._count,
    t(comentarios._max.createdAt),
  ].join(".");

  return Response.json({ v }, { headers: { "Cache-Control": "no-store" } });
}
