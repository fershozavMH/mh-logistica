import SubmitButton from "@/components/SubmitButton";
import { Lock } from "lucide-react";
import { activarCuentaAction } from "@/lib/auth-actions";
import { prisma } from "@/lib/prisma";
import { MIN_LARGO_CLAVE, formatoTokenValido, sha256 } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ERRORES: Record<string, string> = {
  corta: `La contraseña debe tener al menos ${MIN_LARGO_CLAVE} caracteres.`,
  distintas: "Las contraseñas no coinciden.",
  vencido: "Este link ya no es válido. Pide uno nuevo al administrador.",
  muchos: "Demasiados intentos desde este equipo. Espera unos minutos.",
};

const vigente = (d: Date | null) => !!d && d.getTime() > Date.now();

export default async function ActivarPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const u = formatoTokenValido(token)
    ? await prisma.usuario.findUnique({
        where: { invitacionHash: sha256(token) },
        select: { nombre: true, email: true, activo: true, invitacionExpira: true },
      })
    : null;
  const valido = !!u && u.activo && vigente(u.invitacionExpira);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm bg-surface rounded-xl border border-border shadow-[var(--shadow-card)] p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-12 w-12 rounded-lg bg-brand-orange-500 flex items-center justify-center font-bold text-white text-lg mb-3">
            MH
          </div>
          <h1 className="text-lg font-semibold text-ink-primary">Elige tu contraseña</h1>
          {valido && (
            <p className="text-sm text-ink-muted mt-1">
              {u!.nombre} · {u!.email}
            </p>
          )}
        </div>

        {valido ? (
          <form action={activarCuentaAction} className="space-y-3">
            <input type="hidden" name="token" value={token} />
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input type="password" name="nueva" required autoFocus minLength={MIN_LARGO_CLAVE} autoComplete="new-password" placeholder={`Contraseña (mín. ${MIN_LARGO_CLAVE} caracteres)`} className="w-full rounded-lg border border-border pl-9 pr-3 py-2.5 text-sm" />
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input type="password" name="confirmar" required minLength={MIN_LARGO_CLAVE} autoComplete="new-password" placeholder="Repite la contraseña" className="w-full rounded-lg border border-border pl-9 pr-3 py-2.5 text-sm" />
            </div>
            {error && <p className="text-sm text-red-600">{ERRORES[error] ?? ERRORES.vencido}</p>}
            <SubmitButton pendingText="Guardando…" className="w-full rounded-lg bg-brand-navy text-white text-sm font-medium px-4 py-2.5 hover:opacity-90">
              Guardar y entrar
            </SubmitButton>
          </form>
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-sm text-red-600">{ERRORES.vencido}</p>
            <a href="/login" className="text-sm text-brand-navy hover:underline">Ir al inicio de sesión</a>
          </div>
        )}
      </div>
    </div>
  );
}
