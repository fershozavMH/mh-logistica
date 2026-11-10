import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import TopBar from "@/components/TopBar";
import { Card, CardHeader } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import CopiarTexto from "@/components/CopiarTexto";
import { prisma } from "@/lib/prisma";
import { getSesion } from "@/lib/auth-server";
import { FLASH_LINK, ROLES, ROL_LABEL, esRol, formatoTokenValido } from "@/lib/auth";
import {
  actualizarUsuario,
  cambiarActivo,
  cerrarSesionesDe,
  crearUsuario,
  generarLinkActivacion,
  ocultarLink,
} from "@/lib/usuarios-actions";

export const dynamic = "force-dynamic";

const ERRORES: Record<string, string> = {
  correo: "El correo no es válido.",
  nombre: "Falta el nombre.",
  rol: "Elige un rol.",
  existe: "Ya hay un usuario con ese correo.",
  datos: "Revisa el nombre y el rol.",
  propio: "No puedes quitarte el rol de administrador ni desactivar tu propia cuenta.",
};

const fecha = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Hermosillo" }).format(d) : "—";

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sesion = await getSesion();
  if (!sesion || sesion.rol !== "total") redirect("/");
  const { error } = await searchParams;

  const ahora = new Date();
  const usuarios = await prisma.usuario.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    select: {
      id: true,
      email: true,
      nombre: true,
      rol: true,
      activo: true,
      passwordHash: true,
      invitacionExpira: true,
      ultimoAcceso: true,
      bloqueadoHasta: true,
      _count: { select: { sesiones: { where: { expira: { gt: ahora } } } } },
    },
  });

  // link recién generado (cookie de un solo uso, solo visible en /usuarios)
  let link: { email: string; url: string } | null = null;
  try {
    const crudo = (await cookies()).get(FLASH_LINK)?.value;
    const datos = crudo ? (JSON.parse(crudo) as { email?: string; token?: string }) : null;
    if (datos?.email && formatoTokenValido(datos.token)) {
      const h = await headers();
      const host = h.get("x-forwarded-host") ?? h.get("host");
      const proto = h.get("x-forwarded-proto") ?? "https";
      link = { email: datos.email, url: `${proto}://${host}/activar/${datos.token}` };
    }
  } catch {
    link = null;
  }

  return (
    <>
      <TopBar title="Usuarios" subtitle="accesos y roles" />
      <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        {error && <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{ERRORES[error] ?? "No se pudo guardar."}</p>}

        {link && (
          <Card className="border-brand-orange-500">
            <div className="p-5 space-y-3">
              <p className="text-sm text-ink-primary">
                Link para que <strong>{link.email}</strong> elija su contraseña. Vale 72 horas y sirve una sola vez.
                Mándaselo por WhatsApp o correo; no se vuelve a mostrar.
              </p>
              <code className="block break-all rounded-lg bg-surface-muted px-3 py-2 text-xs">{link.url}</code>
              <div className="flex gap-2">
                <CopiarTexto texto={link.url} />
                <form action={ocultarLink}>
                  <SubmitButton className="rounded-lg border border-border text-xs px-3 py-2">Listo, ocultar</SubmitButton>
                </form>
              </div>
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Agregar usuario" subtitle="Se crea sin contraseña; luego se genera su link de activación." />
          <form action={crearUsuario} className="p-5 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Correo</span>
              <input type="email" name="email" required className="rounded-lg border border-border px-3 py-2 text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Nombre</span>
              <input name="nombre" required maxLength={100} className="rounded-lg border border-border px-3 py-2 text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-secondary">Rol</span>
              <select name="rol" defaultValue="lectura" className="rounded-lg border border-border bg-white px-3 py-2 text-sm">
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROL_LABEL[r]}</option>
                ))}
              </select>
            </label>
            <SubmitButton pendingText="Creando…" className="rounded-lg bg-brand-navy text-white text-sm font-medium px-4 py-2">
              Crear y generar link
            </SubmitButton>
          </form>
        </Card>

        <Card>
          <CardHeader title="Usuarios" subtitle="Solo lectura: ve todo, no captura. Operación: ve y captura. Administrador: además administra usuarios." />
          <div className="divide-y divide-border">
            {usuarios.map((u) => {
              const estado = !u.activo
                ? "Desactivado"
                : u.passwordHash
                  ? "Activo"
                  : u.invitacionExpira && u.invitacionExpira > ahora
                    ? "Link enviado, sin activar"
                    : "Sin activar";
              const propio = u.id === sesion.usuarioId;
              return (
                <div key={u.id} className={`p-5 space-y-3 ${u.activo ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-ink-primary">
                        {u.nombre} {propio && <span className="text-xs text-ink-muted">(tú)</span>}
                      </p>
                      <p className="text-xs text-ink-muted">{u.email}</p>
                    </div>
                    <div className="text-right text-xs text-ink-muted">
                      <p className="font-medium text-ink-secondary">{estado}{u.bloqueadoHasta && u.bloqueadoHasta > ahora ? " · bloqueado 15 min" : ""}</p>
                      <p>Último acceso: {fecha(u.ultimoAcceso)} · Sesiones abiertas: {u._count.sesiones}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <form action={actualizarUsuario.bind(null, u.id)} className="flex flex-wrap items-end gap-2">
                      <input name="nombre" defaultValue={u.nombre} required maxLength={100} className="rounded-lg border border-border px-3 py-1.5 text-sm" />
                      <select name="rol" defaultValue={esRol(u.rol) ? u.rol : "lectura"} className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm">
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{ROL_LABEL[r]}</option>
                        ))}
                      </select>
                      <SubmitButton pendingText="Guardando…" className="rounded-lg border border-border text-xs px-3 py-2">Guardar</SubmitButton>
                    </form>
                    {u.activo && (
                      <form action={generarLinkActivacion.bind(null, u.id)}>
                        <SubmitButton pendingText="Generando…" className="rounded-lg border border-border text-xs px-3 py-2">
                          {u.passwordHash ? "Link para cambiar contraseña" : "Generar link de activación"}
                        </SubmitButton>
                      </form>
                    )}
                    {u._count.sesiones > 0 && (
                      <form action={cerrarSesionesDe.bind(null, u.id)}>
                        <ConfirmSubmitButton confirmText={propio ? "¿Cerrar tus sesiones en los demás equipos?" : `¿Cerrar todas las sesiones de ${u.nombre}?`} className="rounded-lg border border-border text-xs px-3 py-2">
                          Cerrar sesiones
                        </ConfirmSubmitButton>
                      </form>
                    )}
                    {!propio && (
                      <form action={cambiarActivo.bind(null, u.id, !u.activo)}>
                        <ConfirmSubmitButton
                          confirmText={u.activo ? `¿Desactivar a ${u.nombre}? Se cierran sus sesiones y ya no podrá entrar.` : `¿Reactivar a ${u.nombre}?`}
                          className={`rounded-lg text-xs px-3 py-2 ${u.activo ? "border border-red-200 text-red-600" : "border border-border"}`}
                        >
                          {u.activo ? "Desactivar" : "Reactivar"}
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </main>
    </>
  );
}
