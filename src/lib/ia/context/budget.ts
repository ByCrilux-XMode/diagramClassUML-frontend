import type { IAChatMessage, IAToolDef } from "../types";
import type { ProviderProfile } from "../providers";

/**
 * Estimación de tokens sin tokenizer: `caracteres / 3.5`.
 *
 * Es deliberadamente conservadora y barata. Para español y JSON de herramientas
 * el error queda por debajo del margen del 10 % que se aplica al presupuesto.
 */
export const CHARS_POR_TOKEN = 3.5;

/** Margen de seguridad sobre la ventana de entrada. */
export const MARGEN_PRESUPUESTO = 0.1;

/** Marca que se añade a un resultado de herramienta recortado. */
export const MARCA_TRUNCADO = "\n[…salida recortada por presupuesto de contexto]";

export function estimateTokens(texto: string): number {
  return Math.ceil(texto.length / CHARS_POR_TOKEN);
}

export function estimateMessagesTokens(messages: IAChatMessage[]): number {
  return messages.reduce((total, mensaje) => {
    const contenido = typeof mensaje.content === "string" ? mensaje.content : "";
    const llamadas = mensaje.tool_calls ? JSON.stringify(mensaje.tool_calls) : "";
    return total + estimateTokens(contenido) + estimateTokens(llamadas) + 4;
  }, 0);
}

export function medirHerramientas(tools: IAToolDef[]): number {
  return estimateTokens(JSON.stringify(tools));
}

export interface Presupuesto {
  /** Tokens disponibles para toda la entrada (system + historial + mensaje). */
  entrada: number;
  /** Ventana total declarada. */
  ventana: number;
  /** Reserva para la respuesta. */
  salida: number;
  herramientas: number;
  sistema: number;
  /** Lo que queda para historial y mensaje actual. */
  disponible: number;
}

/**
 * Calcula el presupuesto de entrada a partir del perfil y del tamaño real de
 * las herramientas. No usa constantes de tamaño de herramientas: se miden en
 * runtime para que añadir una tool ajuste el presupuesto automáticamente.
 */
export function calcularPresupuesto(
  perfil: ProviderProfile,
  tools: IAToolDef[],
  systemPrompt: string,
): Presupuesto {
  const ventana = perfil.contextWindow;
  const salida = perfil.maxOutput;
  const entrada = Math.max(0, Math.floor((ventana - salida) * (1 - MARGEN_PRESUPUESTO)));
  const herramientas = medirHerramientas(tools);
  const sistema = estimateTokens(systemPrompt);
  return {
    entrada,
    ventana,
    salida,
    herramientas,
    sistema,
    disponible: Math.max(0, entrada - herramientas - sistema),
  };
}

/**
 * Agrupa el historial en bloques que empiezan en cada mensaje `user`.
 *
 * Un bloque es la unidad mínima que se puede eliminar sin dejar un `tool`
 * huérfano ni un `assistant` con `tool_calls` sin respuestas: por construcción
 * el bloque contiene la petición, las llamadas y sus resultados.
 */
export function agruparEnBloques(history: IAChatMessage[]): IAChatMessage[][] {
  const bloques: IAChatMessage[][] = [];
  let actual: IAChatMessage[] = [];
  for (const mensaje of history) {
    if (mensaje.role === "user" && actual.length > 0) {
      bloques.push(actual);
      actual = [];
    }
    actual.push(mensaje);
  }
  if (actual.length > 0) bloques.push(actual);
  return bloques;
}

/**
 * Elimina mensajes que quedaron sin pareja: `tool` sin un `assistant` que lo
 * invoque y `assistant` con `tool_calls` sin todos sus resultados.
 */
export function sanearIntegridad(messages: IAChatMessage[]): IAChatMessage[] {
  const resultado: IAChatMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const mensaje = messages[i];

    if (mensaje.role === "tool") {
      const previo = resultado[resultado.length - 1];
      const invocado =
        previo?.role === "assistant" &&
        (previo.tool_calls ?? []).some((call) => call.id === mensaje.tool_call_id);
      if (!invocado) continue;
      resultado.push(mensaje);
      continue;
    }

    if (mensaje.role === "assistant" && mensaje.tool_calls && mensaje.tool_calls.length > 0) {
      const ids = new Set(mensaje.tool_calls.map((call) => call.id));
      let completos = 0;
      for (let j = i + 1; j < messages.length && messages[j].role === "tool"; j++) {
        const id = messages[j].tool_call_id;
        if (id && ids.has(id)) completos++;
      }
      // Se conserva solo si todas las llamadas tienen su resultado.
      if (completos !== mensaje.tool_calls.length) continue;
      resultado.push(mensaje);
      continue;
    }

    resultado.push(mensaje);
  }

  return resultado;
}

/** Descarta un preludio que no empiece en `user` (resto de un bloque cortado). */
export function recortarHastaPrimerUsuario(messages: IAChatMessage[]): IAChatMessage[] {
  const primerUsuario = messages.findIndex((m) => m.role === "user");
  return primerUsuario === -1 ? [] : messages.slice(primerUsuario);
}

export interface ResultadoRecorte {
  messages: IAChatMessage[];
  eliminados: number;
  truncados: number;
  tokensEstimados: number;
  presupuesto: Presupuesto;
}

interface RecortarParams {
  messages: IAChatMessage[];
  tools: IAToolDef[];
  systemPrompt: string;
  perfil: ProviderProfile;
}

/**
 * Ajusta la lista de mensajes al presupuesto del proveedor.
 *
 * Reglas duras:
 *  - el `system` nunca se elimina;
 *  - el bloque del mensaje actual (`user` más reciente) nunca se elimina;
 *  - se eliminan bloques completos, del más antiguo al más nuevo;
 *  - nunca queda un `tool` huérfano.
 */
export function recortarMensajes({
  messages,
  tools,
  systemPrompt,
  perfil,
}: RecortarParams): ResultadoRecorte {
  const presupuesto = calcularPresupuesto(perfil, tools, systemPrompt);
  const indiceSistema = messages.findIndex((m) => m.role === "system");
  const sistema = indiceSistema >= 0 ? messages[indiceSistema] : { role: "system" as const, content: systemPrompt };
  const resto = messages.filter((_, i) => i !== indiceSistema);

  let indiceUltimoUsuario = -1;
  for (let i = resto.length - 1; i >= 0; i--) {
    if (resto[i].role === "user") {
      indiceUltimoUsuario = i;
      break;
    }
  }
  if (indiceUltimoUsuario === -1) {
    return {
      messages,
      eliminados: 0,
      truncados: 0,
      tokensEstimados: estimateMessagesTokens(messages),
      presupuesto,
    };
  }

  const anteriores = resto.slice(0, indiceUltimoUsuario);
  const fijos = resto.slice(indiceUltimoUsuario);
  const bloques = agruparEnBloques(anteriores);

  let eliminados = 0;
  const candidatos = [...bloques];
  let total = estimateMessagesTokens([sistema, ...candidatos.flat(), ...fijos]);

  while (candidatos.length > 0 && total > presupuesto.entrada) {
    candidatos.shift();
    eliminados++;
    total = estimateMessagesTokens([sistema, ...candidatos.flat(), ...fijos]);
  }

  const historialSaneado = recortarHastaPrimerUsuario(sanearIntegridad([...candidatos.flat(), ...fijos]));
  let combinados = [sistema, ...historialSaneado];

  let truncados = 0;
  let tokens = estimateMessagesTokens(combinados);
  if (tokens > presupuesto.entrada) {
    const limitePorMensaje = Math.max(
      200,
      Math.floor((presupuesto.entrada - estimateMessagesTokens(combinados.filter((m) => m.role !== "tool"))) / Math.max(1, combinados.filter((m) => m.role === "tool").length)),
    );
    combinados = combinados.map((mensaje) => {
      if (mensaje.role !== "tool") return mensaje;
      if (estimateTokens(mensaje.content) <= limitePorMensaje) return mensaje;
      truncados++;
      const maxChars = Math.max(0, Math.floor(limitePorMensaje * CHARS_POR_TOKEN) - MARCA_TRUNCADO.length);
      return { ...mensaje, content: mensaje.content.slice(0, maxChars) + MARCA_TRUNCADO };
    });
    tokens = estimateMessagesTokens(combinados);
  }

  if (combinados.length === 0 || combinados[0].role !== "system") {
    combinados = [sistema, ...combinados];
    tokens = estimateMessagesTokens(combinados);
  }

  return { messages: combinados, eliminados, truncados, tokensEstimados: tokens, presupuesto };
}

/** Salida de diagnóstico cuando `IA_DEBUG_CONTEXT` está activo. */
export function logContexto(etiqueta: string, resultado: ResultadoRecorte, ronda: number): void {
  if (process.env.IA_DEBUG_CONTEXT !== "1") return;
  const { presupuesto, tokensEstimados, eliminados, truncados } = resultado;
  console.log(
    `[ia:contexto] ${etiqueta} ronda=${ronda} tokens=${tokensEstimados}/${presupuesto.entrada}` +
      ` ventana=${presupuesto.ventana} herramientas=${presupuesto.herramientas}` +
      ` sistema=${presupuesto.sistema} bloquesEliminados=${eliminados} truncados=${truncados}`,
  );
}
