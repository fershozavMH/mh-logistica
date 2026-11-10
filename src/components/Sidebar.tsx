"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Truck,
  Map,
  Wallet,
  BarChart3,
  FileClock,
  FileText,
  Upload,
  Handshake,
  Building2,
  Eye, Users } from "lucide-react";
import Globe from "@/components/Globe";

// Cohete con una estela/rayo grande, para que "viaje" por una ruta curva
// sobre el mundo del menú — dibujado a mano en SVG. Apunta hacia la derecha
// (estela a la izquierda). Como viaja sobre un offset-path con
// offset-rotate: auto (ver RUTAS más abajo), el navegador lo va rotando solo
// para que siempre apunte en la dirección de la ruta — nunca falla, no hace
// falta calcular ángulos a mano.
function RocketIcon({ size = 40, className, trailId }: { size?: number; className?: string; trailId: string }) {
  return (
    <svg width={size} height={size * 0.42} viewBox="0 0 92 30" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={trailId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
          <stop offset="65%" stopColor="currentColor" stopOpacity="0.5" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      {/* estela / rayo, bien grande */}
      <path d="M0 15 L58 7 L58 23 Z" fill={`url(#${trailId})`} />
      {/* acento de rayo dentro de la estela */}
      <path
        d="M4 15 L28 11.5 L20 15 L42 12.5"
        stroke="#ffffff"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.6"
      />
      {/* aletas */}
      <path d="M60 10 L54 3 L63 8 Z" fill="currentColor" opacity="0.85" />
      <path d="M60 20 L54 27 L63 22 Z" fill="currentColor" opacity="0.85" />
      {/* cuerpo */}
      <path d="M58 15 L78 10 Q89 15 78 20 Z" fill="currentColor" />
      {/* ventana */}
      <circle cx="70" cy="15" r="2.6" fill="#0f2440" opacity="0.6" />
    </svg>
  );
}

// Tres órbitas cerradas (elipses completas) alrededor del mundo — cada
// cohete da la vuelta entera (360°) sin parar, usando offset-path (soportado
// por todos los navegadores modernos): el navegador se encarga de la
// posición Y la rotación en cada punto del camino, así nunca se "rompe" el
// movimiento ni se corta al cerrar la vuelta (son caminos cerrados).
const RUTAS = [
  { d: "M6,72 A66,40 0 1,0 138,72 A66,40 0 1,0 6,72", color: "text-sky-400", trailId: "mhRocketTrailBlue", duration: 3.5 },
  { d: "M26,72 A46,66 0 1,0 118,72 A46,66 0 1,0 26,72", color: "text-brand-orange-500", trailId: "mhRocketTrailOrange", duration: 4.2 },
  { d: "M12,72 A60,60 0 1,0 132,72 A60,60 0 1,0 12,72", color: "text-yellow-400", trailId: "mhRocketTrailYellow", duration: 5 },
];

const NAV = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/operaciones", label: "Operaciones", icon: Truck },
  { href: "/mapa", label: "Mapa de flujo", icon: Map },
  { href: "/costos", label: "Costos y pagos", icon: Wallet },
  { href: "/cotizaciones", label: "Cotizaciones", icon: FileText },
  { href: "/ventas", label: "Ventas", icon: Handshake },
  { href: "/analitica", label: "Analítica", icon: BarChart3 },
  { href: "/reportes", label: "Reportes", icon: FileClock },
  { href: "/importar", label: "Importar datos", icon: Upload },
];

export default function Sidebar({ soloLectura = false, admin = false }: { soloLectura?: boolean; admin?: boolean }) {
  const pathname = usePathname();
  if (pathname === "/login" || pathname.startsWith("/activar") || pathname.startsWith("/publico") || pathname === "/reportes/pantalla") return null;

  const base = soloLectura ? NAV.filter((item) => item.href !== "/importar") : NAV;
  const items = admin ? [...base, { href: "/usuarios", label: "Usuarios", icon: Users }] : base;

  return (
    <aside className="no-print hidden md:flex md:w-64 md:flex-col bg-brand-navy text-white shrink-0">
      <div className="flex items-center gap-2 px-5 h-16 border-b border-white/10">
        <div className="h-9 w-9 rounded-lg bg-brand-orange-500 flex items-center justify-center font-bold text-white">
          MH
        </div>
        <div>
          <p className="font-semibold leading-tight">MH Logística</p>
          <p className="text-xs text-white/60 leading-tight">Panel de operaciones</p>
        </div>
      </div>

      {soloLectura && (
        <div className="mx-3 mt-3 flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/80">
          <Eye size={13} />
          Solo lectura
        </div>
      )}

      <nav className="px-3 py-4 space-y-1">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-white/10 text-white font-medium"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon size={18} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Planeta Tierra brilloso con 3 rutas de vuelo curvas, cada una con su
          propio cohete viajando en bucle — SVG + CSS, sin librerías */}
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <div className="relative w-36 h-36">
          <Globe size={144} className="relative z-10 shadow-[0_0_32px_rgba(59,130,246,0.35)]" />
          {/* anillo blanco inclinado, estilo globo terráqueo de escritorio */}
          <div
            className="absolute -inset-1 rounded-full border-[3px] border-white/90 z-10 pointer-events-none"
            style={{ transform: "rotate(-20deg) scaleY(0.38)" }}
          />

          {/* las rutas en sí, como líneas de vuelo */}
          <svg viewBox="0 0 144 144" className="absolute inset-0 z-20 w-full h-full overflow-visible pointer-events-none">
            {RUTAS.map((r) => (
              <path
                key={r.d}
                d={r.d}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeDasharray="2.5 4"
                strokeLinecap="round"
                className={`${r.color} opacity-45`}
              />
            ))}
          </svg>

          {/* los cohetes viajando sobre cada ruta */}
          {RUTAS.map((r) => (
            <div
              key={r.d}
              className="absolute inset-0 z-20 pointer-events-none mh-fly"
              style={{
                offsetPath: `path('${r.d}')`,
                offsetRotate: "auto",
                animationDuration: `${r.duration}s`,
              }}
            >
              <RocketIcon size={34} trailId={r.trailId} className={`${r.color} drop-shadow-[0_2px_5px_rgba(0,0,0,0.5)]`} />
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 border-t border-white/10 text-xs text-white/50 flex items-center gap-2 shrink-0">
        <Building2 size={14} />
        Machinery Hunters · 2026
      </div>
    </aside>
  );
}
