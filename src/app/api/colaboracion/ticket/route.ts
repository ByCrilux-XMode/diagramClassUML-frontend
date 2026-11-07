import type { NextRequest } from "next/server";
import { COOKIE_SESION, baseUrlBackend } from "@/lib/ia/sesion";

export const runtime = "nodejs";

/**
 * Ticket de corta vida para autenticar el WebSocket de colaboración.
 *
 * Con el proxy, la cookie de sesión es first-party del frontend y no viaja al
 * host del backend en el handshake del WebSocket. Esta ruta lee la cookie en el
 * servidor y pide a Nest un ticket corto (`GET /auth/ticket-colaboracion`), que
 * el navegador adjunta como `?token=` al abrir el socket.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE_SESION)?.value?.trim();
  if (!token) {
    return Response.json({ error: "Inicia sesión para colaborar." }, { status: 401 });
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrlBackend()}/auth/ticket-colaboracion`, {
      method: "GET",
      headers: {
        cookie: `${COOKIE_SESION}=${token}`,
        accept: "application/json",
      },
      cache: "no-store",
    });
  } catch {
    return Response.json(
      { error: "El servicio de colaboración no está disponible." },
      { status: 503 },
    );
  }

  if (!res.ok) {
    return Response.json({ error: "Tu sesión no es válida." }, { status: 401 });
  }

  const datos = (await res.json().catch(() => ({}))) as { token?: unknown };
  if (typeof datos.token !== "string" || datos.token.trim() === "") {
    return Response.json({ error: "El ticket de colaboración es inválido." }, { status: 502 });
  }

  return Response.json({ token: datos.token });
}
