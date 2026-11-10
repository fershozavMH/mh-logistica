import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/generated/prisma/client";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });

// Las fotos y los documentos viven en la base como data URL (base64) y pesan
// cientos de KB cada uno. Traerlos en cada consulta hacía que cada página
// mandara varios MB (Vercel pausó el equipo por Fast Origin Transfer el
// 10-nov-2026). Por eso se OMITEN por defecto en todas las consultas; solo
// las rutas /api/foto, /publico/foto y /api/documento los piden a propósito
// con `omit: { campo: false }`. Ver docs/PLAN-reducir-transferencia-vercel.md.
const crearCliente = () =>
  new PrismaClient({
    adapter,
    omit: {
      shipment: { fotoUrl: true },
      cotizacion: { fotoUrl: true },
      documento: { archivoUrl: true },
    },
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof crearCliente> | undefined;
};

export const prisma = globalForPrisma.prisma ?? crearCliente();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
