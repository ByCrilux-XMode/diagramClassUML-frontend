import { IA_CHAT_TIMEOUT_MS } from "./config";
import type { MotivoFallback } from "./router";
import type { IAChatMessage, IAChatResponse, IAProvider, IAToolDef } from "./types";

/**
 * Cliente del proxy `/api/ia/chat`.
 *
 * Vive aquí, y no dentro de `agentLoop`, porque el resumen rodante también
 * necesita una llamada sin herramientas. El proxy es el único punto que
 * conoce las API keys: el navegador nunca las ve.
 */
export interface ProxyBody {
  provider: IAProvider;
  model: string;
  messages: IAChatMessage[];
  tools: IAToolDef[];
}

/** Motivos propios del transporte que no son fallbacks reintentables. */
export type MotivoErrorProxy =
  | MotivoFallback
  | "4xx"
  | "abort"
  | "sesion"
  | "servicio";

export class ErrorProxy extends Error {
  constructor(
    readonly motivo: MotivoErrorProxy,
    mensaje: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(mensaje);
    this.name = "ErrorProxy";
  }
}

export interface OpcionesProxy {
  timeoutMs?: number;
  /** Abort provocado por la persona: no se reintenta ni se cambia de tramo. */
  signal?: AbortSignal;
}

/** Quita cualquier credencial que el proveedor hubiera reflejado en su error. */
export function sanitizarMensaje(mensaje: string): string {
  return mensaje
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redactado]")
    .replace(/\b(?:sk|hf|or)-[A-Za-z0-9._-]{12,}\b/gi, "[redactado]")
    .replace(/((?:api[_-]?key|token|secret)\s*[=:]\s*)[^\s,;]+/gi, "$1[redactado]");
}

function leerRetryAfter(valor: string | null, ahora: number): number | undefined {
  if (!valor) return undefined;
  const segundos = Number(valor);
  if (Number.isFinite(segundos) && segundos >= 0) return Math.round(segundos * 1000);
  const fecha = Date.parse(valor);
  if (!Number.isNaN(fecha)) return Math.max(0, fecha - ahora);
  return undefined;
}

function motivoDeEstado(status: number): MotivoErrorProxy {
  // Fase 9: 401 solo puede venir de la guardia de sesión (el chat y el help
  // convierten cualquier fallo del proveedor en 502) y 503 está reservado para
  // un backend de autenticación caído. Ninguno se reintenta ni cambia de tramo.
  if (status === 401) return "sesion";
  if (status === 503) return "servicio";
  if (status === 429) return "429";
  if (status >= 500) return "5xx";
  return "4xx";
}

/**
 * Un intento de chat con timeout propio y error tipado. `chatConFallback` usa
 * esta función; `chatViaProxy` conserva el contrato simple para el resto del
 * código.
 */
export async function solicitarChat(
  body: ProxyBody,
  opciones: OpcionesProxy = {},
): Promise<IAChatResponse> {
  const timeoutMs = opciones.timeoutMs ?? IA_CHAT_TIMEOUT_MS;
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
      throw new ErrorProxy("abort", "La operación fue cancelada.");
    }
    opciones.signal.addEventListener("abort", alAbortar, { once: true });
  }

  try {
    let res: Response;
    try {
      res = await fetch("/api/ia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (abortadoPorTimeout) {
        throw new ErrorProxy("timeout", `El proveedor no respondió en ${timeoutMs} ms.`);
      }
      if (opciones.signal?.aborted) {
        throw new ErrorProxy("abort", "La operación fue cancelada.");
      }
      const mensaje = err instanceof Error ? err.message : String(err);
      throw new ErrorProxy("red", sanitizarMensaje(`No se pudo conectar con el proveedor: ${mensaje}`));
    }

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      const motivo = motivoDeEstado(res.status);
      const mensaje = sanitizarMensaje(
        data.error ?? `El proxy IA respondió HTTP ${res.status}.`,
      );
      throw new ErrorProxy(
        motivo,
        mensaje,
        res.status,
        leerRetryAfter(res.headers?.get?.("Retry-After") ?? null, Date.now()),
      );
    }

    let data: Partial<IAChatResponse> & { error?: string };
    try {
      data = (await res.json()) as Partial<IAChatResponse> & { error?: string };
    } catch {
      throw new ErrorProxy(
        "respuesta-invalida",
        "El proveedor devolvió una respuesta que no es JSON válido.",
        res.status,
      );
    }

    return {
      content: data.content ?? "",
      toolCalls: Array.isArray(data.toolCalls) ? data.toolCalls : [],
      model: data.model,
    };
  } finally {
    if (timer) clearTimeout(timer);
    opciones.signal?.removeEventListener("abort", alAbortar);
  }
}

export async function chatViaProxy(
  body: ProxyBody,
  opciones: OpcionesProxy = {},
): Promise<IAChatResponse> {
  return solicitarChat(body, opciones);
}

/**
 * Mensaje para la persona. La sesión vencida y el backend caído no se
 * presentan como "el asistente no respondió" (fase 9, D63/D66).
 */
export function mensajeDeErrorIA(error: unknown): string {
  if (error instanceof ErrorProxy) {
    if (error.motivo === "sesion") {
      return "Tu sesión venció. Vuelve a iniciar sesión para usar el asistente.";
    }
    if (error.motivo === "servicio") {
      return "El servicio de autenticación no está disponible. Inténtalo de nuevo en unos segundos.";
    }
    if (error.motivo === "429") {
      const segundos =
        error.retryAfterMs !== undefined
          ? Math.max(1, Math.ceil(error.retryAfterMs / 1000))
          : null;
      return segundos
        ? `Has alcanzado el límite de uso del asistente. Espera ${segundos} s y vuelve a intentarlo.`
        : "Has alcanzado el límite de uso del asistente. Espera un momento y vuelve a intentarlo.";
    }
  }
  const mensaje = error instanceof Error ? error.message : String(error);
  return `El asistente no respondió: ${mensaje}`;
}
