import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, formatoTokenValido } from "@/lib/auth";
import { validarToken } from "@/lib/sesion";

// Rutas que son solo para dar de alta/importar datos — no tiene sentido que
// las vea alguien con acceso de solo lectura (Dirección), así que se bloquean
// desde aquí en vez de dejar que carguen y truenen al enviar el formulario.
const RUTAS_SOLO_ESCRITURA = ["/embarques/nuevo", "/importar"];

// Rutas sin sesión:
//   /login, /activar  → para entrar o elegir contraseña
//   /publico/unidad, /publico/foto → ficha que se manda al cliente; se abre
//                       solo con el token aleatorio de esa unidad
//   /api/erp          → las llama el ERP con su token Bearer (src/lib/erp-auth.ts)
// /publico/operacion SÍ pide sesión (muestra clientes y notas internas): a
// Ventas se le da un usuario de Solo lectura.
const SIN_SESION = ["/login", "/activar/", "/publico/unidad/", "/publico/foto/", "/api/erp"];

// Estas rutas validan la sesión por su cuenta (getAuthRole) y responden 401;
// así cada miniatura no hace dos consultas a la base.
const VALIDAN_SOLAS = ["/api/foto/", "/api/documento/", "/api/pantalla/"];

function aLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (SIN_SESION.some((r) => pathname.startsWith(r))) return NextResponse.next();

  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (!formatoTokenValido(token)) return aLogin(req);
  if (VALIDAN_SOLAS.some((r) => pathname.startsWith(r))) return NextResponse.next();

  // la sesión se revisa contra la base: si se cerró o el usuario se
  // desactivó, deja de entrar en ese mismo momento
  const sesion = await validarToken(token);
  if (!sesion) {
    const res = aLogin(req);
    res.cookies.delete(AUTH_COOKIE);
    return res;
  }

  if (sesion.authRole === "view" && RUTAS_SOLO_ESCRITURA.some((r) => pathname.startsWith(r))) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
