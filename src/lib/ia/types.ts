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

export interface PendingProposal {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  round: number;
}

export interface AgentResult {
  finalContent: string;
  trace: TurnTrace[];
  pendingProposals?: PendingProposal[];
  hitlRequired?: boolean;
}

export interface HealthResult {
  ok: boolean;
  error?: string;
}