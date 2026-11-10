"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Truck, Map, Wallet, BarChart3, FileClock, FileText, Handshake, ClipboardList } from "lucide-react";

const NAV = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/operaciones", label: "Operaciones", icon: Truck },
  { href: "/mapa", label: "Mapa", icon: Map },
  { href: "/por-cotizar", label: "Cotizar", icon: ClipboardList },
  { href: "/costos", label: "Costos", icon: Wallet },
  { href: "/cotizaciones", label: "Cotiz.", icon: FileText },
  { href: "/ventas", label: "Ventas", icon: Handshake },
  { href: "/analitica", label: "Analítica", icon: BarChart3 },
  { href: "/reportes", label: "Reportes", icon: FileClock },
];

export default function MobileNav() {
  const pathname = usePathname();
  if (pathname === "/login" || pathname.startsWith("/activar") || pathname.startsWith("/publico") || pathname === "/reportes/pantalla") return null;

  return (
    <nav className="no-print md:hidden shrink-0 z-20 bg-brand-navy border-b border-white/10 flex overflow-x-auto">
      {NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-0.5 px-4 py-2 text-[10px] shrink-0 ${
              active ? "text-white" : "text-white/60"
            }`}
          >
            <Icon size={18} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
