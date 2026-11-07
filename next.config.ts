import type { NextConfig } from "next";

/**
 * Backend absoluto para el proxy same-origin.
 *
 * El navegador llama a `/backend/*` (mismo origen que el frontend), y Next
 * reenvía la petición al backend Nest. Así la cookie `tokenAcceso` que emite
 * Nest queda guardada en el dominio del frontend (first-party), y tanto el
 * proxy de rutas como las rutas `/api/ia/*` pueden leerla.
 *
 * `BACKEND_URL` es server-only. Como respaldo en despliegues antiguos se usa
 * `NEXT_PUBLIC_BASE_URL` solo si es una URL absoluta.
 */
function urlAbsoluta(valor: string | undefined): string {
  const limpio = valor?.trim();
  if (!limpio || !/^https?:\/\//i.test(limpio)) return "";
  return limpio.replace(/\/+$/, "");
}

const BACKEND = urlAbsoluta(process.env.BACKEND_URL) || urlAbsoluta(process.env.NEXT_PUBLIC_BASE_URL);

const nextConfig: NextConfig = {
  async rewrites() {
    if (!BACKEND) return [];
    return [
      {
        source: "/backend/:path*",
        destination: `${BACKEND}/:path*`,
      },
    ];
  },
};

export default nextConfig;
