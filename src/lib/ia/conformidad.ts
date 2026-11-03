import { buildToolDefs } from "./buildToolDefs";
import { extractToolCallsFromContent } from "./agentLoop";
import { IA_CHAT_TIMEOUT_MS } from "./config";
import { sanitizarMensaje, solicitarChat } from "./proxy";
import type { IAProvider, IAToolCall } from "./types";

/**
 * Prueba de conformidad (D60).
 *
 * Es una sonda explícita del cliente, no un endpoint: necesita
 * `buildToolDefs()`, que arrastra el registry de herramientas con dependencia
 * de GoJS. Se paga una sola vez por proveedor/modelo y se cachea 10 minutos.
 */

export type EstadoConformidad = "verde" | "amarillo" | "rojo";

export interface ResultadoConformidad {
  estado: EstadoConformidad;
  proveedor: IAProvider;
  modelo: string;
  detalle: string;
  probadoEn: string;
}

export const PROMPT_CONFORMIDAD =
  "Crea la clase A con el atributo x y conéctala con una asociación a la clase B.";

export const CONFORMIDAD_TTL_MS = 10 * 60 * 1000;

const PREFIJO_CACHE = "ia.conformidad:";
const memoria = new Map<string, ResultadoConformidad>();

function clave(proveedor: IAProvider, modelo: string): string {
  return `${PREFIJO_CACHE}${proveedor}:${modelo}`;
}

function esResultado(valor: unknown): valor is ResultadoConformidad {
  if (typeof valor !== "object" || valor === null) return false;
  const candidato = valor as Partial<ResultadoConformidad>;
  return (
    (candidato.estado === "verde" ||
      candidato.estado === "amarillo" ||
      candidato.estado === "rojo") &&
    typeof candidato.proveedor === "string" &&
    typeof candidato.modelo === "string" &&
    typeof candidato.detalle === "string" &&
    typeof candidato.probadoEn === "string"
  );
}

function vigente(resultado: ResultadoConformidad, ahora: number): boolean {
  const fecha = new Date(resultado.probadoEn).getTime();
  return !Number.isNaN(fecha) && ahora - fecha < CONFORMIDAD_TTL_MS;
}

export function leerConformidadCache(
  proveedor: IAProvider,
  modelo: string,
  ahora = Date.now(),
): ResultadoConformidad | null {
  const llave = clave(proveedor, modelo);
  const enMemoria = memoria.get(llave);
  if (enMemoria && vigente(enMemoria, ahora)) return enMemoria;
  memoria.delete(llave);

  if (typeof window === "undefined") return null;
  try {
    const crudo = window.sessionStorage.getItem(llave);
    if (!crudo) return null;
    const parsed: unknown = JSON.parse(crudo);
    if (!esResultado(parsed) || !vigente(parsed, ahora)) {
      window.sessionStorage.removeItem(llave);
      return null;
    }
    memoria.set(llave, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function guardarConformidadCache(resultado: ResultadoConformidad): void {
  const llave = clave(resultado.proveedor, resultado.modelo);
  memoria.set(llave, resultado);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(llave, JSON.stringify(resultado));
  } catch {
    // cuota llena o sessionStorage no disponible: la caché en memoria basta
  }
}

/** Invalida un modelo concreto; se llama al cambiar de modelo en el selector. */
export function invalidarConformidad(proveedor: IAProvider, modelo: string): void {
  const llave = clave(proveedor, modelo);
  memoria.delete(llave);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(llave);
  } catch {
    // sin sessionStorage no hay nada que invalidar
  }
}

function nombresValidos(calls: IAToolCall[]): string[] {
  return calls
    .map((call) => call.function?.name?.trim() ?? "")
    .filter((nombre) => nombre !== "");
}

export function clasificarConformidad(input: {
  proveedor: IAProvider;
  modelo: string;
  toolCalls: IAToolCall[];
  content: string;
  probadoEn?: string;
}): ResultadoConformidad {
  const probadoEn = input.probadoEn ?? new Date().toISOString();
  const nativos = nombresValidos(input.toolCalls);
  if (nativos.length > 0) {
    return {
      estado: "verde",
      proveedor: input.proveedor,
      modelo: input.modelo,
      detalle: `tool_calls nativos: ${nativos.join(", ")}.`,
      probadoEn,
    };
  }

  const recuperadas = nombresValidos(extractToolCallsFromContent(input.content ?? ""));
  if (recuperadas.length > 0) {
    return {
      estado: "amarillo",
      proveedor: input.proveedor,
      modelo: input.modelo,
      detalle: `Sin tool_calls nativos; la edición depende del parser de texto (${recuperadas.join(", ")}).`,
      probadoEn,
    };
  }

  return {
    estado: "rojo",
    proveedor: input.proveedor,
    modelo: input.modelo,
    detalle: "No produjo ninguna herramienta válida; solo sirve para consulta.",
    probadoEn,
  };
}

export interface OpcionesConformidad {
  proveedor: IAProvider;
  modelo: string;
  timeoutMs?: number;
  /** Fuerza la sonda aunque haya caché vigente. */
  forzar?: boolean;
  ahora?: number;
  signal?: AbortSignal;
}

/**
 * Ejecuta la sonda contra un proveedor/modelo concreto. Nunca lanza: un fallo
 * se clasifica como rojo para que el badge no bloquee el selector.
 */
export async function probarConformidad(
  opciones: OpcionesConformidad,
): Promise<ResultadoConformidad> {
  const ahora = opciones.ahora ?? Date.now();
  if (!opciones.forzar) {
    const cacheado = leerConformidadCache(opciones.proveedor, opciones.modelo, ahora);
    if (cacheado) return cacheado;
  }

  let resultado: ResultadoConformidad;
  try {
    const respuesta = await solicitarChat(
      {
        provider: opciones.proveedor,
        model: opciones.modelo,
        messages: [
          {
            role: "system",
            content:
              "Eres un asistente UML. Usa las herramientas disponibles cuando la petición pida cambios en el diagrama.",
          },
          { role: "user", content: PROMPT_CONFORMIDAD },
        ],
        tools: buildToolDefs(),
      },
      {
        timeoutMs: opciones.timeoutMs ?? IA_CHAT_TIMEOUT_MS,
        signal: opciones.signal,
      },
    );

    resultado = clasificarConformidad({
      proveedor: opciones.proveedor,
      modelo: opciones.modelo,
      toolCalls: respuesta.toolCalls,
      content: respuesta.content,
      probadoEn: new Date(ahora).toISOString(),
    });
  } catch (err: unknown) {
    const mensaje = sanitizarMensaje(err instanceof Error ? err.message : String(err));
    resultado = {
      estado: "rojo",
      proveedor: opciones.proveedor,
      modelo: opciones.modelo,
      detalle: `La sonda falló: ${mensaje}`,
      probadoEn: new Date(ahora).toISOString(),
    };
  }

  guardarConformidadCache(resultado);
  return resultado;
}

/** Texto corto para el badge y su `title`. */
export function formatearConformidad(resultado: ResultadoConformidad | null): {
  etiqueta: string;
  detalle: string;
} {
  if (!resultado) {
    return {
      etiqueta: "Sin probar",
      detalle: "Prueba el proveedor para saber si puede editar con tool calls.",
    };
  }
  const etiqueta =
    resultado.estado === "verde"
      ? "Edita"
      : resultado.estado === "amarillo"
        ? "Edita por texto"
        : "Solo consulta";
  return {
    etiqueta,
    detalle: `${resultado.proveedor} · ${resultado.modelo}: ${resultado.detalle}`,
  };
}
