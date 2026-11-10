import { cache } from "react";
import { cookies } from "next/headers";
import { AUTH_COOKIE, type AuthRole } from "@/lib/auth";
import { validarToken, type SesionActiva } from "@/lib/sesion";

// Una sola consulta por petición aunque varias partes de la página lo pidan.
export const getSesion = cache(async (): Promise<SesionActiva | null> => {
  const store = await cookies();
  return validarToken(store.get(AUTH_COOKIE)?.value);
});

export async function getAuthRole(): Promise<AuthRole> {
  return (await getSesion())?.authRole ?? null;
}

export async function esSoloLectura(): Promise<boolean> {
  return (await getAuthRole()) === "view";
}

export async function esAdmin(): Promise<boolean> {
  return (await getSesion())?.rol === "total";
}
