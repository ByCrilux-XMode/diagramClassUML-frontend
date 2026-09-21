import { executeTool, getDiagram, validateArgs } from "@/lib/editorTools";
import type { ToolArgs, ToolName } from "@/lib/editorTools";
import { buildToolDefs } from "./buildToolDefs";
import { IA_CHAT_TIMEOUT_MS, IA_MAX_TOOL_ROUNDS } from "./config";
import { applyGridLayout } from "@/lib/go/autoLayout";
import type {
  AgentResult,
  IAChatMessage,
  IAChatResponse,
  IAProvider,
  IAToolCall,
  PendingProposal,
  TurnTrace,
} from "./types";

export interface AgentLoopParams {
  provider: IAProvider;
  model: string;
  systemPrompt: string;
  userMessage: string;
  history?: IAChatMessage[];
  maxRounds?: number;
  onTurn?: (turn: TurnTrace) => void;
  hitl?: boolean;
  images?: string[];
}

interface ProxyBody {
  provider: IAProvider;
  model: string;
  messages: IAChatMessage[];
  tools: ReturnType<typeof buildToolDefs>;
}

async function chatViaProxy(body: ProxyBody): Promise<IAChatResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IA_CHAT_TIMEOUT_MS);
  try {
    const res = await fetch("/api/ia/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Partial<IAChatResponse> & {
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error ?? `El proxy IA respondió HTTP ${res.status}.`);
    }
    return {
      content: data.content ?? "",
      toolCalls: Array.isArray(data.toolCalls) ? data.toolCalls : [],
      model: data.model,
    };
  } finally {
    clearTimeout(timer);
  }
}

function safeParseArgs(args: string | undefined | Record<string, unknown>): unknown {
  if (args === undefined || args === null) return {};
  if (typeof args === "object") return args;
  try {
    return JSON.parse(args);
  } catch {
    return {};
  }
}

function toolResultJson(ok: boolean, data: Record<string, unknown> | undefined, message: string | undefined, error?: string): string {
  if (ok) {
    return JSON.stringify({ ok: true, ...(data ?? {}), ...(message ? { message } : {}) });
  }
  return JSON.stringify({ ok: false, error: error ?? "La herramienta falló." });
}

const KNOWN_TOOL_NAMES = new Set([
  "addClass",
  "removeClass",
  "rename",
  "connect",
  "disconnect",
  "updateAttribute",
  "updateMethod",
  "replaceAll",
  "validate",
]);

function extractToolCallsFromContent(content: string): IAToolCall[] {
  if (!content || typeof content !== "string") return [];
  const calls: IAToolCall[] = [];
  // También soporta <tool_call>...</tool_call>
  const unwrapped = content.replace(/<tool_call>/gi, " ").replace(/<\/tool_call>/gi, " ");
  let idx = 0;
  while (idx < unwrapped.length) {
    const start = unwrapped.indexOf('{"name"', idx);
    const start2 = unwrapped.indexOf("{'name'", idx);
    // también {"name" : sin envolver con comillas simples no nos interesa
    let pos = -1;
    if (start !== -1 && start2 !== -1) pos = Math.min(start, start2);
    else pos = start !== -1 ? start : start2;
    if (pos === -1) {
      // fallback: busca "name" suelto sin envolver
      const alt = unwrapped.indexOf('"name"', idx);
      if (alt === -1) break;
      // intenta encontrar el '{' que abre el objeto
      const braceStart = unwrapped.lastIndexOf("{", alt);
      if (braceStart === -1 || braceStart < idx) {
        idx = alt + 6;
        continue;
      }
      pos = braceStart;
    }
    let depth = 0;
    let end = -1;
    for (let i = pos; i < unwrapped.length; i++) {
      const ch = unwrapped[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break;
    const slice = unwrapped.slice(pos, end + 1);
    try {
      const parsed = JSON.parse(slice) as { name?: string; arguments?: unknown };
      if (typeof parsed.name === "string" && KNOWN_TOOL_NAMES.has(parsed.name)) {
        let args: Record<string, unknown> = {};
        if (parsed.arguments && typeof parsed.arguments === "object" && !Array.isArray(parsed.arguments)) {
          args = parsed.arguments as Record<string, unknown>;
        } else if (typeof parsed.arguments === "string" && parsed.arguments.trim() !== "") {
          try {
            const inner = JSON.parse(parsed.arguments) as unknown;
            if (inner && typeof inner === "object" && !Array.isArray(inner)) args = inner as Record<string, unknown>;
            else if (typeof inner === "string") args = { value: inner };
          } catch {
            // string no es JSON, ignora y deja args vacío para que validate falle con mensaje claro
          }
        }
        calls.push({
          id: `fallback-${Date.now()}-${calls.length}`,
          type: "function",
          function: { name: parsed.name, arguments: JSON.stringify(args) },
        });
      }
    } catch {
      // no es JSON válido, ignora y avanza
    }
    idx = end + 1;
  }
  return calls;
}

export async function runAgentLoop(params: AgentLoopParams): Promise<AgentResult> {
  const maxRounds = Math.max(1, params.maxRounds ?? IA_MAX_TOOL_ROUNDS);
  const userImages = params.images && params.images.length > 0 ? params.images : undefined;
  const messages: IAChatMessage[] = [
    { role: "system", content: params.systemPrompt },
    ...(params.history ?? []),
    { role: "user", content: params.userMessage, ...(userImages ? { images: userImages } : {}) },
  ];
  const trace: TurnTrace[] = [];
  const pendingProposals: PendingProposal[] = [];
  const hitl = params.hitl ?? true;
  let lastContent = "";

  for (let round = 0; round < maxRounds; round++) {
    const response = await chatViaProxy({
      provider: params.provider,
      model: params.model,
      messages,
      tools: buildToolDefs(),
    });
    lastContent = response.content ?? "";

    let toolCalls: IAToolCall[] = Array.isArray(response.toolCalls) ? response.toolCalls : [];
    if (toolCalls.length === 0) {
      const fallback = extractToolCallsFromContent(response.content ?? "");
      if (fallback.length > 0) toolCalls = fallback;
    }
    if (toolCalls.length === 0) {
      return {
        finalContent: response.content,
        trace,
        pendingProposals: pendingProposals.length > 0 ? pendingProposals : undefined,
        hitlRequired: pendingProposals.length > 0,
      };
    }

    messages.push({
      role: "assistant",
      content: response.content ?? "",
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const name = call.function?.name ?? "";
      const parsed = safeParseArgs(call.function?.arguments);
      const validation = validateArgs(name as ToolName, parsed);

      if (!validation || !validation.ok) {
        const errorMsg =
          validation && !validation.ok
            ? validation.error
            : `Tool desconocido: '${name}'.`;
        trace.push({ round, toolName: name, ok: false, error: errorMsg });
        params.onTurn?.(trace[trace.length - 1]);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name,
          content: toolResultJson(false, undefined, undefined, errorMsg),
        });
        continue;
      }
      //intercepto human in loop
      if (hitl) {
        // HITL: no ejecuta, solo propone. Guarda para aprobación humana.
        pendingProposals.push({
          id: call.id,
          toolName: name,
          args: validation.value as unknown as Record<string, unknown>,
          round,
        });
        trace.push({ round, toolName: name, ok: true });
        params.onTurn?.(trace[trace.length - 1]);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name,
          content: JSON.stringify({ ok: true, proposed: true, tool: name }),
        });
        continue;
      }
      let result: ToolResultLike;
      try {
        result = executeTool(name as ToolName, validation.value as ToolArgs);
      } catch (err: unknown) {
        result = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      trace.push({
        round,
        toolName: name,
        ok: result.ok,
        error: result.ok ? undefined : result.error,
      });
      params.onTurn?.(trace[trace.length - 1]);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name,
        content: toolResultJson(result.ok, result.data, result.message, result.error),
      });
    }
  }

  return {
    finalContent:
      pendingProposals.length > 0
        ? lastContent.trim() || "Propuesta lista para revisión humana."
        : "Se alcanzó el límite de rondas de herramientas y el modelo no entregó una respuesta final. Revisa el trace de abajo o reformula tu pedido.",
    trace,
    pendingProposals: pendingProposals.length > 0 ? pendingProposals : undefined,
    hitlRequired: pendingProposals.length > 0,
  };
}

export function applyPendingProposals(pending: PendingProposal[]): {
  trace: TurnTrace[];
  applied: number;
  errors: string[];
} {
  const trace: TurnTrace[] = [];
  const errors: string[] = [];
  let applied = 0;
  for (const p of pending) {
    const validation = validateArgs(p.toolName as ToolName, p.args);
    if (!validation || !validation.ok) {
      const msg = validation && !validation.ok ? validation.error : `Tool desconocido: '${p.toolName}'.`;
      trace.push({ round: p.round, toolName: p.toolName, ok: false, error: msg });
      errors.push(msg);
      continue;
    }
    try {
      const result = executeTool(p.toolName as ToolName, validation.value as ToolArgs);
      trace.push({ round: p.round, toolName: p.toolName, ok: result.ok, error: result.ok ? undefined : result.error });
      if (result.ok) applied++;
      else if (result.error) errors.push(result.error);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      trace.push({ round: p.round, toolName: p.toolName, ok: false, error: msg });
      errors.push(msg);
    }
  }
  const hasAddClass = pending.some((p) => p.toolName === "addClass");
  const hasIADecidedLoc = pending.some((p) => p.toolName === "addClass" && typeof (p.args as Record<string, unknown>).loc === "string" && String((p.args as Record<string, unknown>).loc).trim() !== "");
  if (hasAddClass && applied > 1 && !hasIADecidedLoc) {
    try {
      applyGridLayout(getDiagram());
    } catch {
      // layout opcional, no bloquea el flujo HITL
    }
  }
  return { trace, applied, errors };
}

interface ToolResultLike {
  ok: boolean;
  error?: string;
  message?: string;
  data?: Record<string, unknown>;
}