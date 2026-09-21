import { IA_CHAT_TIMEOUT_MS, IA_NUM_CTX, OLLAMA_BASE_URL } from "@/lib/ia/config";
import type {
  HealthResult,
  IAChatMessage,
  IAChatRequestBody,
  IAChatResponse,
  IAToolCall,
} from "@/lib/ia/types";

interface OllamaTag {
  name: string;
  model?: string;
}

interface RawToolCall {
  id?: string;
  function?: { name?: string; arguments?: string | Record<string, unknown> };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = IA_CHAT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function toJsonArgs(args: string | Record<string, unknown> | undefined): string {
  if (typeof args === "string") return args;
  return JSON.stringify(args ?? {});
}

function toIAToolCall(call: RawToolCall, index: number): IAToolCall {
  return {
    id: call.id ?? `call-${Date.now()}-${index}`,
    type: "function",
    function: {
      name: String(call.function?.name ?? ""),
      arguments: toJsonArgs(call.function?.arguments),
    },
  };
}

function toOllamaMessages(messages: IAChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      return {
        role: "assistant",
        content: m.content ?? "",
        tool_calls: (m.tool_calls ?? []).map((tc) => ({
          function: {
            name: tc.function.name,
            arguments: safeParse(tc.function.arguments),
          },
        })),
      };
    }
    if (m.role === "tool") {
      return { role: "tool", content: m.content ?? "" };
    }
    if (m.role === "user" && Array.isArray(m.images) && m.images.length > 0) {
      return { role: m.role, content: m.content ?? "", images: m.images };
    }
    return { role: m.role, content: m.content ?? "" };
  });
}

function safeParse(args: string | undefined): Record<string, unknown> {
  if (!args) return {};
  try {
    const parsed: unknown = JSON.parse(args);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function health(): Promise<HealthResult> {
  try {
    const res = await fetchWithTimeout(`${OLLAMA_BASE_URL}/api/tags`, {}, 5000);
    if (!res.ok) return { ok: false, error: `Ollama respondió HTTP ${res.status}.` };
    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function listModels(): Promise<string[]> {
  const res = await fetchWithTimeout(`${OLLAMA_BASE_URL}/api/tags`, {}, 10000);
  if (!res.ok) throw new Error(`Ollama /api/tags respondió HTTP ${res.status}.`);
  const data = (await res.json()) as { models?: OllamaTag[] };
  const all = (data.models ?? []).map((m) => m.model ?? m.name);
  // Modelos descartados para la demo/examen: no ofrecerlos en el selector
  const descartados = new Set(["llama3-groq-tool-use:8b", "ministral-3:3b", "ministral:3b"]);
  return all.filter((n) => !descartados.has(n));
}

export async function chat(req: IAChatRequestBody): Promise<IAChatResponse> {
  const payload = {
    model: req.model,
    messages: toOllamaMessages(req.messages),
    tools: req.tools,
    stream: false,
    options: { num_ctx: IA_NUM_CTX },
  };
  const res = await fetchWithTimeout(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama /api/chat respondió HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    model?: string;
    message?: { content?: string; tool_calls?: RawToolCall[] };
  };
  return {
    content: data.message?.content ?? "",
    toolCalls: (data.message?.tool_calls ?? []).map(toIAToolCall),
    model: data.model,
  };
}