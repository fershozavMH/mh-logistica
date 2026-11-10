import { prisma } from "@/lib/prisma";
import { authRoleDe, formatoTokenValido, sha256, type AuthRole } from "@/lib/auth";

export interface SesionActiva {
  sesionId: string;
  usuarioId: string;
  email: string;
  nombre: string;
  rol: string;
  authRole: Exclude<AuthRole, null>;
}

// Valida el token de la cookie contra la tabla Sesion. Se usa en proxy.ts
// (antes de pintar cualquier pantalla) y en el servidor (acciones y rutas).
// Un usuario desactivado o una sesión borrada dejan de entrar al instante.
export async function validarToken(token: string | undefined): Promise<SesionActiva | null> {
  if (!formatoTokenValido(token)) return null;
  try {
    const s = await prisma.sesion.findUnique({
      where: { tokenHash: sha256(token) },
      select: {
        id: true,
        expira: true,
        usuario: { select: { id: true, email: true, nombre: true, rol: true, activo: true } },
      },
    });
    if (!s || s.expira.getTime() < Date.now() || !s.usuario.activo) return null;
    const authRole = authRoleDe(s.usuario.rol);
    if (!authRole) return null;
    return {
      sesionId: s.id,
      usuarioId: s.usuario.id,
      email: s.usuario.email,
      nombre: s.usuario.nombre,
      rol: s.usuario.rol,
      authRole,
    };
  } catch (err) {
    console.error("[sesion] no se pudo validar", err instanceof Error ? err.message : err);
    return null;
  }
}

// Primera vez: no hay ningún administrador con contraseña todavía. Se puede
// activar la cuenta de administrador (rol "total", sin contraseña, creada en
// la migración) demostrando que se conoce la clave APP_PASSWORD de Vercel.
export async function puedeActivarAdmin(): Promise<boolean> {
  if (!process.env.APP_PASSWORD) return false;
  const conClave = await prisma.usuario.count({ where: { rol: "total", activo: true, passwordHash: { not: null } } });
  return conClave === 0;
}

