export type IAProvider = "ollama" | "huggingface" | "openrouter" | "hf-space";

export interface IAToolFunction {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

export interface IAToolDef {
  type: "function";
  function: IAToolFunction;
}

export interface IAToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface IAChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: IAToolCall[];
  images?: string[];
}

export interface IAChatRequestBody {
  provider: IAProvider;
  model: string;
  messages: IAChatMessage[];
  tools: IAToolDef[];
  /** OpenRouter: origin real del request (HTTP-Referer). En Vercel debe ser el dominio del frontend, no el base del backend. */
  httpReferer?: string;
}

export interface IAChatResponse {
  content: string;
  toolCalls: IAToolCall[];
  model?: string;
  /** OpenRouter: nº de fallbacks de key que hubo que probar antes de acertar. */
  keyFallbacksUsed?: number;
}

export interface TurnTrace {
  round: number;
  toolName: string;
  ok: boolean;
  error?: string;
}

export interface PersonaIA {
  usuarioId: number;
  nombre: string;
}

export interface PendingProposal {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  round: number;
  /** Turno que produjo la propuesta; agrupa todos sus eventos. */
  turnoId?: string;
  /** Proveedor que la produjo, no el que esté seleccionado al aprobar. */
  proveedor?: IAProvider;
  /** Modelo que la produjo, no el que esté seleccionado al aprobar. */
  modelo?: string;
  solicitadoPor?: PersonaIA;
  /** Proyecto abierto al proponer; aprobar en otro se rechaza. */
  proyectoId?: string | null;
}

export interface CapaContexto {
  id: number;
  nombre: string;
  tokens: number;
  recortada: boolean;
}

/** Resultado del recorte de contexto de un turno. */
export interface ContextoInfo {
  bloquesEliminados: number;
  truncados: number;
  tokensEstimados: number;
  presupuestoEntrada: number;
  ventana: number;
  aviso?: string;
  /** Tokens y recorte por capa del system prompt. */
  capas?: CapaContexto[];
  /** Fuentes que no se pudieron cargar en este turno. */
  degradado?: string[];
}

export interface FallbackIA {
  proveedor: IAProvider;
  modelo: string;
  motivo: "timeout" | "red" | "429" | "5xx" | "respuesta-invalida";
}

export interface AgentResult {
  finalContent: string;
  trace: TurnTrace[];
  pendingProposals?: PendingProposal[];
  hitlRequired?: boolean;
  contexto?: ContextoInfo;
  /** Tramo que produjo la última respuesta (D62). */
  proveedorUsado?: IAProvider;
  modeloUsado?: string;
  /** Intentos fallidos antes de la respuesta; vacío si respondió el primero. */
  fallbacks?: FallbackIA[];
}

export interface HealthResult {
  ok: boolean;
  error?: string;
}