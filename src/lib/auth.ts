import { createHash, randomBytes, scrypt, timingSafeEqual, createHmac, type ScryptOptions } from "node:crypto";

// Cookie nueva (la anterior "mh_auth" era de la clave compartida; con el
// cambio de nombre todas esas sesiones viejas dejan de servir solas).
export const AUTH_COOKIE = "mh_sesion";

// Roles de cada usuario:
//   "lectura"   → solo ver (Dirección)
//   "operacion" → ver y capturar
//   "total"     → además administra usuarios
export const ROLES = ["lectura", "operacion", "total"] as const;
export type Rol = (typeof ROLES)[number];
export const ROL_LABEL: Record<Rol, string> = {
  lectura: "Solo lectura",
  operacion: "Operación",
  total: "Administrador",
};
export function esRol(v: unknown): v is Rol {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

// Lo que usa el resto de la app (sin cambios): "full" puede capturar,
// "view" solo ver.
export type AuthRole = "full" | "view" | null;
export const authRoleDe = (rol: string): AuthRole => (rol === "lectura" ? "view" : esRol(rol) ? "full" : null);

export const SESION_CORTA_SEG = 60 * 60 * 12; // 12 h
export const SESION_LARGA_SEG = 60 * 60 * 24 * 30; // 30 días ("mantener sesión", p. ej. la TV)
export const INVITACION_SEG = 60 * 60 * 72; // link de activación: 72 h
// Cookie de un solo uso para mostrarle al administrador el link de
// activación recién generado (así el token no queda en la URL ni en el
// historial del navegador).
export const FLASH_LINK = "mh_link_activacion";
export const MAX_INTENTOS = 5;
export const BLOQUEO_MIN = 15;
export const MIN_LARGO_CLAVE = 10;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const tokenAleatorio = () => randomBytes(32).toString("base64url");

export function normalizarEmail(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}
export function emailValido(e: string): boolean {
  return e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

// Contraseñas con scrypt (incluido en Node, sin dependencias nativas):
// N=2^15, r=8, p=1 → ~32 MB y ~100 ms por intento. Formato guardado:
// scrypt$N$r$p$sal$hash (base64url).
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function scryptAsync(clave: string, sal: Buffer, largo: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((res, rej) => scrypt(clave, sal, largo, opts, (err, k) => (err ? rej(err) : res(k))));
}

export async function hashClave(clave: string): Promise<string> {
  const sal = randomBytes(16);
  const k = await scryptAsync(clave.normalize("NFKC"), sal, 32, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, sal.toString("base64url"), k.toString("base64url")].join("$");
}

export async function verificarClave(clave: string, guardado: string | null): Promise<boolean> {
  // sin hash guardado se calcula uno de todos modos, para que la respuesta
  // tarde lo mismo exista o no el usuario
  const partes = (guardado ?? "").split("$");
  const valido = partes.length === 6 && partes[0] === "scrypt" && Number(partes[1]) <= 1 << 17;
  const N = valido ? Number(partes[1]) : SCRYPT.N;
  const r = valido ? Number(partes[2]) : SCRYPT.r;
  const p = valido ? Number(partes[3]) : SCRYPT.p;
  const sal = valido ? Buffer.from(partes[4], "base64url") : randomBytes(16);
  const esperado = valido ? Buffer.from(partes[5], "base64url") : randomBytes(32);
  const k = await scryptAsync(clave.normalize("NFKC"), sal, esperado.length, { N, r, p, maxmem: SCRYPT.maxmem });
  return valido && k.length === esperado.length && timingSafeEqual(k, esperado);
}

export function problemaConClave(clave: string): string | null {
  if (clave.length < MIN_LARGO_CLAVE) return `La contraseña debe tener al menos ${MIN_LARGO_CLAVE} caracteres.`;
  if (clave.length > 200) return "La contraseña es demasiado larga.";
  return null;
}

// Comparación de textos en tiempo constante.
export function igualesSeguro(a: string, b: string): boolean {
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// El token de la cookie: 32 bytes en base64url = 43 caracteres.
export const formatoTokenValido = (t: string | undefined): t is string => !!t && /^[A-Za-z0-9_-]{43}$/.test(t);
