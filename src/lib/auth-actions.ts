"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { puedeActivarAdmin } from "@/lib/sesion";
import {
  AUTH_COOKIE,
  BLOQUEO_MIN,
  MAX_INTENTOS,
  SESION_CORTA_SEG,
  SESION_LARGA_SEG,
  formatoTokenValido,
  hashClave,
  igualesSeguro,
  normalizarEmail,
  problemaConClave,
  sha256,
  tokenAleatorio,
  verificarClave,
} from "@/lib/auth";

// solo rutas internas ("/algo"), nunca "//otro-sitio.com"
function rutaSegura(next: FormDataEntryValue | null): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

const texto = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

// Límite por IP en memoria (por instancia): frena a quien prueba muchos
// correos distintos. El bloqueo por usuario (5 intentos → 15 min) vive en
// la base y sí aplica en todas las instancias.
const VENTANA_MS = 5 * 60_000;
const MAX_POR_IP = 20;
const fallosIp = new Map<string, { inicio: number; n: number }>();
async function ipDelCliente(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sin-ip";
}
// Solo cuentan los intentos fallidos (una oficina detrás de una misma IP
// puede entrar varias veces seguidas sin problema).
async function ipExcedida(): Promise<boolean> {
  const c = fallosIp.get(await ipDelCliente());
  return !!c && Date.now() - c.inicio <= VENTANA_MS && c.n >= MAX_POR_IP;
}
async function sumarFalloIp() {
  const ip = await ipDelCliente();
  const ahora = Date.now();
  const c = fallosIp.get(ip);
  if (!c || ahora - c.inicio > VENTANA_MS) {
    fallosIp.set(ip, { inicio: ahora, n: 1 });
    if (fallosIp.size > 5000) for (const [k, v] of fallosIp) if (ahora - v.inicio > VENTANA_MS) fallosIp.delete(k);
  } else c.n += 1;
}

async function abrirSesion(usuarioId: string, larga: boolean) {
  const token = tokenAleatorio();
  const duracion = larga ? SESION_LARGA_SEG : SESION_CORTA_SEG;
  const agente = ((await headers()).get("user-agent") ?? "").slice(0, 200) || null;
  await prisma.$transaction([
    // de paso se limpian las sesiones vencidas de esa persona
    prisma.sesion.deleteMany({ where: { usuarioId, expira: { lt: new Date() } } }),
    prisma.sesion.create({
      data: { tokenHash: sha256(token), usuarioId, expira: new Date(Date.now() + duracion * 1000), agente },
    }),
    prisma.usuario.update({
      where: { id: usuarioId },
      data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoAcceso: new Date() },
    }),
  ]);
  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: duracion,
  });
  store.delete("mh_auth"); // cookie de la clave compartida anterior
}

export async function loginAction(formData: FormData) {
  const siguiente = rutaSegura(formData.get("next"));
  const volver = (error: string) => redirect(`/login?error=${error}&next=${encodeURIComponent(siguiente)}`);

  if (await ipExcedida()) volver("muchos");

  const email = normalizarEmail(formData.get("email"));
  const clave = texto(formData, "password");
  const recordar = formData.get("recordar") === "on";

  const u = email
    ? await prisma.usuario.findUnique({
        where: { email },
        select: { id: true, nombre: true, passwordHash: true, activo: true, bloqueadoHasta: true, intentosFallidos: true },
      })
    : null;

  if (u?.bloqueadoHasta && u.bloqueadoHasta.getTime() > Date.now()) volver("bloqueado");

  const ok = await verificarClave(clave, u?.passwordHash ?? null);
  if (!u || !ok || !u.activo) {
    if (u) {
      const n = u.intentosFallidos + 1;
      const bloquear = n >= MAX_INTENTOS;
      await prisma.usuario.update({
        where: { id: u.id },
        data: {
          intentosFallidos: bloquear ? 0 : n,
          bloqueadoHasta: bloquear ? new Date(Date.now() + BLOQUEO_MIN * 60_000) : undefined,
        },
      });
      await registrarAuditoria({
        accion: bloquear ? "login.bloqueado" : "login.fallido",
        entidad: "Usuario",
        entidadId: email,
      });
    }
    await sumarFalloIp();
    volver("1");
  }

  await abrirSesion(u!.id, recordar);
  await registrarAuditoria({ accion: "login", entidad: "Usuario", entidadId: email, usuario: u!.nombre });
  redirect(siguiente);
}

export async function logoutAction() {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE)?.value;
  if (formatoTokenValido(token)) {
    await prisma.sesion.deleteMany({ where: { tokenHash: sha256(token) } });
  }
  store.delete(AUTH_COOKIE);
  redirect("/login");
}

export async function activarAdminAction(formData: FormData) {
  const volver = (error: string) => redirect(`/login?modo=activar&error=${error}`);
  if (await ipExcedida()) volver("muchos");
  if (!(await puedeActivarAdmin())) redirect("/login");

  const email = normalizarEmail(formData.get("email"));
  const claveApp = texto(formData, "claveApp");
  const nueva = texto(formData, "nueva");
  const confirmar = texto(formData, "confirmar");

  if (!igualesSeguro(claveApp, process.env.APP_PASSWORD ?? "")) {
    await registrarAuditoria({ accion: "admin.activar_fallido", entidad: "Usuario", entidadId: email || null });
    await sumarFalloIp();
    volver("clave");
  }
  if (problemaConClave(nueva)) volver("corta");
  if (nueva !== confirmar) volver("distintas");

  const u = await prisma.usuario.findUnique({ where: { email }, select: { id: true, nombre: true, rol: true, passwordHash: true, activo: true } });
  if (!u || u.rol !== "total" || u.passwordHash || !u.activo) volver("correo");

  await prisma.usuario.update({
    where: { id: u!.id },
    data: { passwordHash: await hashClave(nueva), invitacionHash: null, invitacionExpira: null },
  });
  await registrarAuditoria({ accion: "admin.activar", entidad: "Usuario", entidadId: email, usuario: u!.nombre });
  await abrirSesion(u!.id, false);
  redirect("/usuarios");
}

// Link de activación (o de cambio de contraseña) que genera el administrador.
export async function activarCuentaAction(formData: FormData) {
  const token = texto(formData, "token");
  const volver = (error: string) => redirect(`/activar/${encodeURIComponent(token)}?error=${error}`);
  if (!formatoTokenValido(token)) redirect("/login");
  if (await ipExcedida()) volver("muchos");

  const nueva = texto(formData, "nueva");
  const confirmar = texto(formData, "confirmar");
  if (problemaConClave(nueva)) volver("corta");
  if (nueva !== confirmar) volver("distintas");

  const u = await prisma.usuario.findUnique({
    where: { invitacionHash: sha256(token) },
    select: { id: true, nombre: true, email: true, activo: true, invitacionExpira: true },
  });
  if (!u || !u.activo || !u.invitacionExpira || u.invitacionExpira.getTime() < Date.now()) {
    await sumarFalloIp();
    volver("vencido");
  }

  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: u!.id },
      data: { passwordHash: await hashClave(nueva), invitacionHash: null, invitacionExpira: null },
    }),
    // al cambiar la contraseña se cierran las sesiones que hubiera
    prisma.sesion.deleteMany({ where: { usuarioId: u!.id } }),
  ]);
  await registrarAuditoria({ accion: "usuario.activar", entidad: "Usuario", entidadId: u!.email, usuario: u!.nombre });
  await abrirSesion(u!.id, false);
  redirect("/");
}
