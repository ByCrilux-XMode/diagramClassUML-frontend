import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (antes middleware) de rutas privadas.
 *
 * Next 16 renombró la convención `middleware` a `proxy`; la funcionalidad es la
 * misma. Con el proxy `/backend` la cookie `tokenAcceso` vive en el dominio del
 * frontend, así que aquí puede verse. Solo se comprueba su presencia: la
 * validez del JWT la sigue decidiendo el backend (un token vencido provoca 401
 * y la página redirige a /login).
 */
const COOKIE_SESION = "tokenAcceso";

export function proxy(request: NextRequest) {
  const tieneSesion = Boolean(request.cookies.get(COOKIE_SESION)?.value?.trim());
  if (tieneSesion) return NextResponse.next();

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/proyectos", "/proyectos/:path*", "/editor", "/editor/:path*"],
};
