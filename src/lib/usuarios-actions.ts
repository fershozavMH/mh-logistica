"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { getSesion } from "@/lib/auth-server";
import { FLASH_LINK, INVITACION_SEG, emailValido, esRol, normalizarEmail, sha256, tokenAleatorio } from "@/lib/auth";

async function requireAdmin() {
  const s = await getSesion();
  if (!s || s.rol !== "total") throw new Error("Solo un administrador puede administrar usuarios.");
  return s;
}

const texto = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};

async function guardarLinkParaMostrar(usuarioId: string, email: string) {
  const token = tokenAleatorio();
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { invitacionHash: sha256(token), invitacionExpira: new Date(Date.now() + INVITACION_SEG * 1000) },
  });
  const store = await cookies();
  store.set(FLASH_LINK, JSON.stringify({ email, token }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/usuarios",
    maxAge: 600,
  });
}

export async function crearUsuario(formData: FormData) {
  const admin = await requireAdmin();
  const email = normalizarEmail(formData.get("email"));
  const nombre = texto(formData, "nombre").slice(0, 100);
  const rol = texto(formData, "rol");
  if (!emailValido(email)) redirect("/usuarios?error=correo");
  if (!nombre) redirect("/usuarios?error=nombre");
  if (!esRol(rol)) redirect("/usuarios?error=rol");

  const existe = await prisma.usuario.findUnique({ where: { email }, select: { id: true } });
  if (existe) redirect("/usuarios?error=existe");

  const u = await prisma.usuario.create({ data: { email, nombre, rol }, select: { id: true } });
  await guardarLinkParaMostrar(u.id, email);
  await registrarAuditoria({ accion: "usuario.crear", entidad: "Usuario", entidadId: email, usuario: admin.nombre, detalle: `rol ${rol}` });
  revalidatePath("/usuarios");
  redirect("/usuarios");
}

// Nuevo link para activar la cuenta o cambiar la contraseña olvidada.
export async function generarLinkActivacion(usuarioId: string) {
  const admin = await requireAdmin();
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { id: true, email: true } });
  if (!u) redirect("/usuarios");
  await guardarLinkParaMostrar(u.id, u.email);
  await registrarAuditoria({ accion: "usuario.link_activacion", entidad: "Usuario", entidadId: u.email, usuario: admin.nombre });
  revalidatePath("/usuarios");
  redirect("/usuarios");
}

export async function actualizarUsuario(usuarioId: string, formData: FormData) {
  const admin = await requireAdmin();
  const nombre = texto(formData, "nombre").slice(0, 100);
  const rol = texto(formData, "rol");
  if (!nombre || !esRol(rol)) redirect("/usuarios?error=datos");
  // no quitarse a uno mismo el rol de administrador (se quedaría sin acceso)
  if (usuarioId === admin.usuarioId && rol !== "total") redirect("/usuarios?error=propio");

  const u = await prisma.usuario.update({ where: { id: usuarioId }, data: { nombre, rol }, select: { email: true } });
  await registrarAuditoria({ accion: "usuario.editar", entidad: "Usuario", entidadId: u.email, usuario: admin.nombre, detalle: `rol ${rol}` });
  revalidatePath("/usuarios");
  redirect("/usuarios");
}

export async function cambiarActivo(usuarioId: string, activo: boolean) {
  const admin = await requireAdmin();
  if (usuarioId === admin.usuarioId) redirect("/usuarios?error=propio");
  const u = await prisma.usuario.update({
    where: { id: usuarioId },
    data: activo ? { activo } : { activo, invitacionHash: null, invitacionExpira: null },
    select: { email: true },
  });
  if (!activo) await prisma.sesion.deleteMany({ where: { usuarioId } });
  await registrarAuditoria({ accion: activo ? "usuario.activar_cuenta" : "usuario.desactivar", entidad: "Usuario", entidadId: u.email, usuario: admin.nombre });
  revalidatePath("/usuarios");
  redirect("/usuarios");
}

// Cierra todas las sesiones abiertas de esa persona (todos sus equipos).
export async function cerrarSesionesDe(usuarioId: string) {
  const admin = await requireAdmin();
  const u = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { email: true } });
  if (!u) redirect("/usuarios");
  await prisma.sesion.deleteMany({
    where: usuarioId === admin.usuarioId ? { usuarioId, NOT: { id: admin.sesionId } } : { usuarioId },
  });
  await registrarAuditoria({ accion: "usuario.cerrar_sesiones", entidad: "Usuario", entidadId: u.email, usuario: admin.nombre });
  revalidatePath("/usuarios");
  redirect("/usuarios");
}

export async function ocultarLink() {
  await requireAdmin();
  (await cookies()).delete({ name: FLASH_LINK, path: "/usuarios" });
  redirect("/usuarios");
}
