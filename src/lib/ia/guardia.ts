import type { NextRequest } from "next/server";
import { consumirLimite, respuestaLimite } from "./limite";
import { leerSesion, respuestaErrorSesion } from "./sesion";
import type { SesionUsuario } from "./sesion";

/**
 * Guardia común de las rutas `/api/ia/*` (fase 9, D63/D66).
 *
 * Orden obligatorio: sesión → límite → proveedor. Así una petición anónima
 * nunca cuenta contra el cupo de un usuario ni llega al adaptador.
 */

export type ResultadoGuardia =
  | { ok: true; usuario: SesionUsuario }
  | { ok: false; respuesta: Response };

export async function guardiaIA(
  request: NextRequest,
  ruta: string,
): Promise<ResultadoGuardia> {
  let usuario: SesionUsuario;
  try {
    usuario = await leerSesion(request);
  } catch (err: unknown) {
    return { ok: false, respuesta: respuestaErrorSesion(err) };
  }

  // Solo id y nombre: el token y la cookie nunca se registran.
  console.info(`[api/ia:${ruta}] usuario=${usuario.usuarioId} (${usuario.nombre})`);

  const limite = consumirLimite(`usuario:${usuario.usuarioId}`);
  if (!limite.permitido) {
    console.warn(
      `[api/ia:${ruta}] límite alcanzado usuario=${usuario.usuarioId} motivo=${limite.motivo}`,
    );
    return { ok: false, respuesta: respuestaLimite(limite) };
  }

  return { ok: true, usuario };
}
