import SubmitButton from "@/components/SubmitButton";
import { Lock, Mail, KeyRound } from "lucide-react";
import { loginAction, activarAdminAction } from "@/lib/auth-actions";
import { puedeActivarAdmin } from "@/lib/sesion";
import { MIN_LARGO_CLAVE } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ERRORES: Record<string, string> = {
  "1": "Correo o contraseña incorrectos.",
  bloqueado: "Demasiados intentos. Espera 15 minutos e intenta de nuevo.",
  muchos: "Demasiados intentos desde este equipo. Espera unos minutos.",
  clave: "La clave de acceso anterior no es correcta.",
  corta: `La contraseña debe tener al menos ${MIN_LARGO_CLAVE} caracteres.`,
  distintas: "Las contraseñas no coinciden.",
  correo: "Ese correo no es una cuenta de administrador pendiente de activar.",
};

const input = "w-full rounded-lg border border-border pl-9 pr-3 py-2.5 text-sm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; modo?: string }>;
}) {
  const { error, next, modo } = await searchParams;
  const activarDisponible = await puedeActivarAdmin();
  const activando = modo === "activar" && activarDisponible;
  const mensaje = error ? (ERRORES[error] ?? ERRORES["1"]) : null;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm bg-surface rounded-xl border border-border shadow-[var(--shadow-card)] p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-12 w-12 rounded-lg bg-brand-orange-500 flex items-center justify-center font-bold text-white text-lg mb-3">
            MH
          </div>
          <h1 className="text-lg font-semibold text-ink-primary">MH Logística</h1>
          <p className="text-sm text-ink-muted mt-1">
            {activando ? "Activa la cuenta de administrador." : "Entra con tu correo y contraseña."}
          </p>
        </div>

        {activando ? (
          <form action={activarAdminAction} className="space-y-3">
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input type="email" name="email" required autoComplete="username" placeholder="Correo del administrador" className={input} />
            </div>
            <div className="relative">
              <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input type="password" name="claveApp" required autoComplete="off" placeholder="Clave de acceso anterior" className={input} />
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input type="password" name="nueva" required minLength={MIN_LARGO_CLAVE} autoComplete="new-password" placeholder={`Nueva contraseña (mín. ${MIN_LARGO_CLAVE})`} className={input} />
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input type="password" name="confirmar" required minLength={MIN_LARGO_CLAVE} autoComplete="new-password" placeholder="Repite la contraseña" className={input} />
            </div>
            {mensaje && <p className="text-sm text-red-600">{mensaje}</p>}
            <SubmitButton pendingText="Activando…" className="w-full rounded-lg bg-brand-navy text-white text-sm font-medium px-4 py-2.5 hover:opacity-90">
              Activar y entrar
            </SubmitButton>
            <a href="/login" className="block text-center text-xs text-ink-muted hover:underline">Volver</a>
          </form>
        ) : (
          <form action={loginAction} className="space-y-3">
            <input type="hidden" name="next" value={next ?? "/"} />
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input type="email" name="email" required autoFocus autoComplete="username" placeholder="Correo" className={input} />
            </div>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input type="password" name="password" required autoComplete="current-password" placeholder="Contraseña" className={input} />
            </div>
            <label className="flex items-center gap-2 text-xs text-ink-secondary">
              <input type="checkbox" name="recordar" className="rounded border-border" />
              Mantener la sesión 30 días en este equipo
            </label>
            {mensaje && <p className="text-sm text-red-600">{mensaje}</p>}
            <SubmitButton pendingText="Entrando…" className="w-full rounded-lg bg-brand-navy text-white text-sm font-medium px-4 py-2.5 hover:opacity-90">
              Entrar
            </SubmitButton>
            <p className="text-center text-xs text-ink-muted">¿Olvidaste tu contraseña? Pide un link nuevo al administrador.</p>
            {activarDisponible && (
              <a href="/login?modo=activar" className="block text-center text-xs text-brand-navy hover:underline">
                Primera vez: activar administrador
              </a>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
