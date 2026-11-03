import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Guardia de sesión del proxy (fase 9, D63/D64).
 *
 * Nest sigue siendo la única fuente de verdad de identidad: aquí solo se toma
 * la cookie `tokenAcceso` y se pregunta a `GET /usuarios/me`. La respuesta se
 * cachea 60 s con clave `sha256(token)` para no añadir un round trip en cada
 * ronda de herramientas.
 */

export const COOKIE_SESION = "tokenAcceso";
export const SESION_TIMEOUT_MS = 3_000;
export const SESION_TTL_MS = 60_000;
export const SESION_MAX_ENTRADAS = 1_000;

export interface SesionUsuario {
  usuarioId: number;
  nombre: string;
}

export type MotivoErrorSesion = "sin-sesion" | "sesion-invalida" | "servicio-no-disponible";

export class ErrorSesion extends Error {
  readonly status: 401 | 503;

  constructor(
    readonly motivo: MotivoErrorSesion,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorSesion";
    this.status = motivo === "servicio-no-disponible" ? 503 : 401;
  }
}

interface EntradaSesion {
  usuario: SesionUsuario;
  expiraEn: number;
}

const cache = new Map<string, EntradaSesion>();

/** Clave derivada: la caché nunca guarda el token en claro. */
export function claveSesion(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function baseUrlDeEntorno(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    process.env.BASE_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

function leerToken(request: Pick<NextRequest, "cookies">): string | null {
  const valor = request.cookies?.get?.(COOKIE_SESION)?.value?.trim();
  return valor ? valor : null;
}

function normalizarUsuario(datos: unknown): SesionUsuario | null {
  if (typeof datos !== "object" || datos === null) return null;
  const crudo = datos as Record<string, unknown>;
  const usuarioId = Number(crudo.usuarioId);
  if (!Number.isFinite(usuarioId)) return null;

  const persona =
    typeof crudo.persona === "object" && crudo.persona !== null
      ? (crudo.persona as Record<string, unknown>)
      : null;
  const nombre =
    [persona?.nombre, persona?.apellido]
      .filter((parte): parte is string => typeof parte === "string" && parte.trim() !== "")
      .join(" ")
      .trim() ||
    (typeof crudo.username === "string" ? crudo.username.trim() : "") ||
    `Usuario ${usuarioId}`;

  return { usuarioId, nombre };
}

function guardarEnCache(clave: string, usuario: SesionUsuario, ahora: number): void {
  // Desalojo del más antiguo: Map conserva el orden de inserción.
  while (cache.size >= SESION_MAX_ENTRADAS && !cache.has(clave)) {
    const primera = cache.keys().next().value;
    if (primera === undefined) break;
    cache.delete(primera);
  }
  cache.set(clave, { usuario, expiraEn: ahora + SESION_TTL_MS });
}

export interface OpcionesLeerSesion {
  /** Inyectable en pruebas; por defecto `Date.now`. */
  ahora?: number;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/**
 * Valida la sesión de la petición. Lanza `ErrorSesion` con 401 si no hay cookie
 * o Nest la rechaza, y con 503 si el backend no responde.
 */
export async function leerSesion(
  request: Pick<NextRequest, "cookies">,
  opciones: OpcionesLeerSesion = {},
): Promise<SesionUsuario> {
  const token = leerToken(request);
  if (!token) {
    throw new ErrorSesion("sin-sesion", "Inicia sesión para usar el asistente.");
  }

  const ahora = opciones.ahora ?? Date.now();
  const clave = claveSesion(token);
  const cacheada = cache.get(clave);
  if (cacheada && cacheada.expiraEn > ahora) {
    return cacheada.usuario;
  }

  const baseUrl = (opciones.baseUrl ?? baseUrlDeEntorno()).replace(/\/+$/, "");
  const timeoutMs = opciones.timeoutMs ?? SESION_TIMEOUT_MS;
  const fetchImpl = opciones.fetchImpl ?? fetch;
  const controller = new AbortController();
  let abortadoPorTimeout = false;
  const timer =
    timeoutMs > 0
      ? setTimeout(() => {
          abortadoPorTimeout = true;
          controller.abort();
        }, timeoutMs)
      : null;
  const alAbortar = () => controller.abort();
  if (opciones.signal) {
    if (opciones.signal.aborted) {
      if (timer) clearTimeout(timer);
      throw new ErrorSesion(
        "servicio-no-disponible",
        "La validación de sesión fue cancelada; el servicio de autenticación no está disponible.",
      );
    }
    opciones.signal.addEventListener("abort", alAbortar, { once: true });
  }

  try {
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}/usuarios/me`, {
        method: "GET",
        headers: {
          cookie: `${COOKIE_SESION}=${token}`,
          accept: "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      // D64: un fallo de red no invalida la caché existente.
      const detalle = abortadoPorTimeout
        ? `El servicio de autenticación no respondió en ${timeoutMs} ms.`
        : "No se pudo conectar con el servicio de autenticación.";
      throw new ErrorSesion(
        "servicio-no-disponible",
        `${detalle} Inténtalo de nuevo en unos segundos.`,
      );
    }

    if (res.status === 401 || res.status === 403) {
      // La sesión fue revocada: se invalida para no seguir sirviéndola.
      cache.delete(clave);
      throw new ErrorSesion("sesion-invalida", "Tu sesión venció. Vuelve a iniciar sesión.");
    }

    if (!res.ok) {
      throw new ErrorSesion(
        "servicio-no-disponible",
        "El servicio de autenticación no está disponible. Inténtalo de nuevo en unos segundos.",
      );
    }

    let datos: unknown;
    try {
      datos = await res.json();
    } catch {
      throw new ErrorSesion(
        "servicio-no-disponible",
        "El servicio de autenticación devolvió una respuesta inválida.",
      );
    }

    const usuario = normalizarUsuario(datos);
    if (!usuario) {
      throw new ErrorSesion(
        "servicio-no-disponible",
        "El servicio de autenticación devolvió una respuesta inválida.",
      );
    }

    guardarEnCache(clave, usuario, ahora);
    return usuario;
  } finally {
    if (timer) clearTimeout(timer);
    opciones.signal?.removeEventListener("abort", alAbortar);
  }
}

/** Convierte el error de la guardia en la respuesta HTTP del proxy. */
export function respuestaErrorSesion(error: unknown): Response {
  if (error instanceof ErrorSesion) {
    return Response.json(
      { error: error.message, motivo: error.motivo },
      { status: error.status },
    );
  }
  return Response.json(
    { error: "No se pudo validar la sesión.", motivo: "servicio-no-disponible" },
    { status: 503 },
  );
}

/** Solo para pruebas: deja la caché limpia entre casos. */
export function limpiarCacheSesion(): void {
  cache.clear();
}

/** Solo para pruebas: claves derivadas presentes en la caché. */
export function clavesCacheSesion(): string[] {
  return [...cache.keys()];
}
