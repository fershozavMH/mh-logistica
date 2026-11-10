import SubmitButton from "@/components/SubmitButton";
import { Lock } from "lucide-react";
import { loginAction } from "@/lib/auth-actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm bg-surface rounded-xl border border-border shadow-[var(--shadow-card)] p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-12 w-12 rounded-lg bg-brand-orange-500 flex items-center justify-center font-bold text-white text-lg mb-3">
            MH
          </div>
          <h1 className="text-lg font-semibold text-ink-primary">MH Logística</h1>
          <p className="text-sm text-ink-muted mt-1">Ingresa la clave de acceso para continuar.</p>
        </div>

        <form action={loginAction} className="space-y-3">
          <input type="hidden" name="next" value={next ?? "/"} />
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="password"
              name="password"
              required
              autoFocus
              placeholder="Clave de acceso"
              className="w-full rounded-lg border border-border pl-9 pr-3 py-2.5 text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-600">Clave incorrecta. Intenta de nuevo.</p>}
          <SubmitButton pendingText="Entrando…" className="w-full rounded-lg bg-brand-navy text-white text-sm font-medium px-4 py-2.5 hover:opacity-90">
            Entrar
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
