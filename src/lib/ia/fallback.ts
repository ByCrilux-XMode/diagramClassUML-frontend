import { IA_CHAT_TIMEOUT_MS, IA_FALLBACK_TIMEOUT_MS } from "./config";
import { ErrorProxy, solicitarChat } from "./proxy";
import { ErrorCadena, modeloDeTramo } from "./router";
import type { FallbackRegistrado, MotivoFallback, TramoProveedor } from "./router";
import type { IAChatMessage, IAChatResponse, IAProvider, IAToolDef } from "./types";

/** Un reintento como máximo por proveedor (D56). */
export const MAX_INTENTOS_POR_TRAMO = 2;
/** Espera corta entre reintentos cuando el proveedor no indica otra cosa. */
export const ESPERA_REINTENTO_MS = 400;
/** Tope de `Retry-After`: más que esto significa pasar al siguiente tramo. */
export const MAX_RETRY_AFTER_MS = 5000;

export interface IntentoPreparado<T = unknown> {
  messages: IAChatMessage[];
  tools: IAToolDef[];
  /** Datos del recorte del intento (presupuesto, capas, etc.). */
  contexto?: T;
}

export interface EventoIntento {
  proveedor: IAProvider;
  modelo: string;
  intento: number;
  fallo?: MotivoFallback;
  esperaMs?: number;
}

export interface OpcionesChatConFallback<T = unknown> {
  cadena: TramoProveedor[];
  /** Se ejecuta por tramo: aquí se recalcula el presupuesto con su perfil. */
  preparar: (tramo: TramoProveedor) => IntentoPreparado<T>;
  timeoutTotalMs?: number;
  timeoutIntentoMs?: number;
  signal?: AbortSignal;
  esperar?: (ms: number) => Promise<void>;
  ahora?: () => number;
  onIntento?: (evento: EventoIntento) => void;
}

export interface ResultadoChatConFallback<T = unknown> extends IAChatResponse {
  proveedorUsado: IAProvider;
  modeloUsado: string;
  fallbacks: FallbackRegistrado[];
  intento: IntentoPreparado<T>;
}

function esperaPorDefecto(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function esReintentable(motivo: MotivoFallback): boolean {
  return motivo === "429" || motivo === "5xx" || motivo === "timeout" || motivo === "red";
}

function resumenIntentos(fallbacks: FallbackRegistrado[]): string {
  return fallbacks.map((fallback) => `${fallback.proveedor}: ${fallback.motivo}`).join(", ");
}

/**
 * Recorre la cadena con un reintento por proveedor. El historial y las rondas
 * de tools viven en el llamador: aquí solo cambia quién responde.
 */
export async function chatConFallback<T = unknown>(
  opciones: OpcionesChatConFallback<T>,
): Promise<ResultadoChatConFallback<T>> {
  if (opciones.cadena.length === 0) {
    throw new ErrorCadena("La cadena de proveedores está vacía; no se envió ninguna petición.");
  }

  const ahora = opciones.ahora ?? Date.now;
  const esperar = opciones.esperar ?? esperaPorDefecto;
  const timeoutTotalMs = opciones.timeoutTotalMs ?? IA_FALLBACK_TIMEOUT_MS;
  const timeoutIntentoMs = opciones.timeoutIntentoMs ?? IA_CHAT_TIMEOUT_MS;
  const limite = ahora() + Math.max(1, timeoutTotalMs);
  const fallbacks: FallbackRegistrado[] = [];

  const errorFinal = (corto: boolean): Error => {
    const detalle = resumenIntentos(fallbacks);
    return new Error(
      corto
        ? `Se agotó el tiempo del turno de IA. Intentos: ${detalle || "ninguno"}.`
        : `Ningún proveedor de la cadena respondió. Intentos: ${detalle || "ninguno"}.`,
    );
  };

  for (const tramo of opciones.cadena) {
    const modelo = modeloDeTramo(tramo);

    for (let intento = 1; intento <= MAX_INTENTOS_POR_TRAMO; intento++) {
      if (ahora() >= limite) throw errorFinal(true);

      // D57: se recalcula también en el reintento del mismo tramo. El
      // llamador puede devolver un recorte distinto en cada intento.
      let preparado: IntentoPreparado<T>;
      try {
        preparado = opciones.preparar(tramo);
      } catch (err: unknown) {
        if (err instanceof ErrorCadena) throw err;
        throw err;
      }

      opciones.onIntento?.({ proveedor: tramo.proveedor, modelo, intento });

      const restante = limite - ahora();
      try {
        const respuesta = await solicitarChat(
          {
            provider: tramo.proveedor,
            model: modelo,
            messages: preparado.messages,
            tools: preparado.tools,
          },
          {
            timeoutMs: Math.min(timeoutIntentoMs, Math.max(1, restante)),
            signal: opciones.signal,
          },
        );

        return {
          ...respuesta,
          proveedorUsado: tramo.proveedor,
          modeloUsado: respuesta.model?.trim() || modelo,
          fallbacks,
          intento: preparado,
        };
      } catch (err: unknown) {
        if (!(err instanceof ErrorProxy)) throw err;

        // Un abort de la persona, un error de petición/credenciales o un fallo
        // de sesión/servicio no se reintenta ni se cambia de proveedor (D56).
        if (
          err.motivo === "abort" ||
          err.motivo === "4xx" ||
          err.motivo === "sesion" ||
          err.motivo === "servicio"
        ) {
          throw err;
        }

        const motivo: MotivoFallback = err.motivo;
        fallbacks.push({ proveedor: tramo.proveedor, modelo, motivo });
        opciones.onIntento?.({
          proveedor: tramo.proveedor,
          modelo,
          intento,
          fallo: motivo,
        });

        if (!esReintentable(motivo)) break;
        if (intento >= MAX_INTENTOS_POR_TRAMO) break;

        if (motivo === "429" && err.retryAfterMs !== undefined) {
          // Si el proveedor pide esperar más que el tope, no se espera: se
          // intenta el siguiente tramo.
          if (err.retryAfterMs > MAX_RETRY_AFTER_MS) break;
          const espera = Math.max(0, err.retryAfterMs);
          if (ahora() + espera >= limite) throw errorFinal(true);
          opciones.onIntento?.({
            proveedor: tramo.proveedor,
            modelo,
            intento,
            fallo: motivo,
            esperaMs: espera,
          });
          await esperar(espera);
          continue;
        }

        if (ahora() + ESPERA_REINTENTO_MS >= limite) throw errorFinal(true);
        opciones.onIntento?.({
          proveedor: tramo.proveedor,
          modelo,
          intento,
          fallo: motivo,
          esperaMs: ESPERA_REINTENTO_MS,
        });
        await esperar(ESPERA_REINTENTO_MS);
      }
    }
  }

  throw errorFinal(ahora() >= limite);
}
