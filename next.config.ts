import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite que el servidor de desarrollo acepte peticiones desde la IP de
  // red local (para que Raúl u otros puedan entrar desde su propia compu
  // mientras no está desplegado en internet). Si la IP de esta compu cambia
  // (ej. el router reasigna otra), hay que actualizar este valor.
  allowedDevOrigins: ["192.168.1.93"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // las fotos y documentos del equipo (facturas, pedimentos, etc.) van
      // como texto base64 dentro de la acción del servidor
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
