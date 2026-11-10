// Aplica las migraciones pendientes de Prisma antes del build en Vercel
// ("vercel-build" en package.json). Así Preview usa la base de pruebas y
// Production la real, cada una con su propia DATABASE_URL.
//
// Neon da una URL con "-pooler" en el host (PgBouncer); las migraciones
// necesitan la conexión directa, que es el mismo host sin "-pooler".
// Si la migración falla, el build se detiene y queda activo el despliegue
// anterior: nunca se publica código que espera tablas que no existen.
import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error("[migrar] falta DATABASE_URL");
  process.exit(1);
}

let directa = url;
try {
  const u = new URL(url);
  u.hostname = u.hostname.replace("-pooler.", ".");
  u.searchParams.delete("pgbouncer");
  directa = u.toString();
} catch {
  // URL rara: se usa tal cual
}

console.log(`[migrar] entorno: ${process.env.VERCEL_ENV ?? "local"}`);
execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: directa },
});
