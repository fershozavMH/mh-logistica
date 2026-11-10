import Link from "next/link";
import { Plus, LogOut } from "lucide-react";
import { TopBarUserBadge } from "@/components/UserSelect";
import { logoutAction } from "@/lib/auth-actions";
import { esSoloLectura } from "@/lib/auth-server";
import BackButton from "@/components/BackButton";

export default async function TopBar({
  title,
  subtitle,
  showBack,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
}) {
  const soloLectura = await esSoloLectura();
  const hoy = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <header className="no-print sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-surface/95 backdrop-blur px-4 md:px-8 h-16 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {showBack && <BackButton />}
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-ink-primary leading-tight truncate">{title}</h1>
          <p className={`text-xs text-ink-muted truncate ${subtitle ? "" : "capitalize"}`}>{subtitle ?? hoy}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <TopBarUserBadge />
        <form action={logoutAction} className="no-print">
          <button
            type="submit"
            title="Salir"
            className="flex items-center justify-center rounded-lg h-9 w-9 text-ink-muted hover:text-red-600 hover:bg-surface-muted"
          >
            <LogOut size={16} />
          </button>
        </form>
        {!soloLectura && (
          <Link
            href="/embarques/nuevo"
            className="flex items-center gap-1.5 rounded-lg bg-brand-blue-600 hover:bg-brand-blue-700 transition-colors text-white text-sm font-medium px-3.5 py-2"
          >
            <Plus size={16} />
            Nueva unidad
          </Link>
        )}
      </div>
    </header>
  );
}
