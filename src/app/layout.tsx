import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";
import { getSesion } from "@/lib/auth-server";
import { SesionProvider } from "@/components/UserSelect";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MH Logística",
  description: "Panel de operaciones de importación y transporte de Machinery Hunters",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const sesion = await getSesion();
  const soloLectura = sesion?.authRole === "view";
  const admin = sesion?.rol === "total";
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full flex bg-background text-ink-primary overflow-hidden">
        <SesionProvider nombre={sesion?.nombre ?? null}>
          <Sidebar soloLectura={soloLectura} admin={admin} />
          <div className="flex-1 flex flex-col min-w-0 h-full">
            <MobileNav />
            {children}
          </div>
        </SesionProvider>
      </body>
    </html>
  );
}
