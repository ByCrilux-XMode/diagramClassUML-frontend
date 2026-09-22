import {
  IA_CHAT_TIMEOUT_MS,
  OPENROUTER_BASE_URL,
} from "@/lib/ia/config";
import type {
  HealthResult,
  IAChatMessage,
  IAChatRequestBody,
  IAChatResponse,
  IAToolCall,
  IAToolDef,
} from "@/lib/ia/types";

const CURATED_MODELS = [
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "anthropic/claude-3.5-haiku",
  "meta-llama/llama-3.3-70b-instruct",
];

/**
 * Resuelve las API keys de OpenRouter en orden de prioridad. Solo se ejecuta
 * en el servidor (este módulo jamás se importa desde el bundle de cliente),
 * así las llaves nunca se filtran al navegador.
 *
 * Orden: OPENROUTER_API_KEY (principal) → OPENROUTER_API_KEY_1..3 →
 * OPENROUTER_API_KEYS (lista separada por comas). Se deduplican.
 */
function resolveApiKeys(): string[] {
  const sources = [
    process.env.OPENROUTER_API_KEY,
    process.env.OPENROUTER_API_KEY_1,
    process.env.OPENROUTER_API_KEY_2,
    process.env.OPENROUTER_API_KEY_3,
    ...(process.env.OPENROUTER_API_KEYS ?? "").split(","),
  ];
  const keys = Array.from(
    new Set(
      sources
        .map((k) => (typeof k === "string" ? k.trim() : ""))
        .filter((k) => k.length > 0)
    )
  );
  return keys.slice(0, 3);
}

let cachedKeys: string[] | null = null;
function getKeys(): string[] {
  if (cachedKeys === null) cachedKeys = resolveApiKeys();
  return cachedKeys;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = IA_CHAT_TIMEOUT_MS
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

function toOpenAiMessages(messages: IAChatMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: m.role, content: m.content ?? "", tool_call_id: m.tool_call_id };
    }
    if (m.role === "assistant") {
      return {
        role: m.role,
        content: m.content ?? "",
        ...(Array.isArray(m.tool_calls) && m.tool_calls.length > 0
          ? { tool_calls: m.tool_calls }
          : {}),
      };
    }
    return { role: m.role, content: m.content ?? "" };
  });
}

function parseError(res: Response, text: string): Error {
  let detail = text || `HTTP ${res.status}`;
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string };
    if (typeof parsed.error === "string") detail = parsed.error;
    else if (parsed.error && typeof parsed.error.message === "string")
      detail = parsed.error.message;
  } catch {
    // se mantiene el texto crudo
  }
  return new Error(`OpenRouter respondió HTTP ${res.status}: ${detail.slice(0, 300)}`);
}

export async function health(): Promise<HealthResult> {
  const keys = getKeys();
  if (keys.length === 0) {
    return {
      ok: false,
      error:
        "Faltan claves de OpenRouter en el servidor. Configura OPENROUTER_API_KEY (y opcionalmente OPENROUTER_API_KEY_1..3).",
    };
  }
  return { ok: true };
}

export async function listModels(): Promise<string[]> {
  const result = new Set<string>(CURATED_MODELS);
  const keys = getKeys();
  if (keys.length === 0) return [...result];
  try {
    const res = await fetchWithTimeout(
      `${OPENROUTER_BASE_URL}/api/v1/models`,
      { headers: { Authorization: `Bearer ${keys[0]}` } },
      10000
    );
    if (res.ok) {
      const json = (await res.json()) as { data?: Array<{ id?: string }> };
      for (const item of json.data ?? []) {
        if (typeof item.id === "string" && item.id) result.add(item.id);
      }
    }
  } catch {
    // sin red: se devuelve la lista curada
  }
  return [...result];
}

/**
 * Chat contra OpenRouter con fallback por llave: prueba cada key en orden y
 * usa la primera que responda 2xx. Si todas fallan, lanza un error único que
 * resume cuántas se intentaron (sin exponer las claves).
 */
export async function chat(req: IAChatRequestBody): Promise<IAChatResponse> {
  const keys = getKeys();
  if (keys.length === 0) {
    throw new Error(
      "Faltan claves de OpenRouter en el servidor. Configura OPENROUTER_API_KEY (y opcionalmente OPENROUTER_API_KEY_1..3)."
    );
  }

  const payload = {
    model: req.model,
    messages: toOpenAiMessages(req.messages),
    tools: req.tools as IAToolDef[],
    tool_choice: req.tools.length > 0 ? "auto" : undefined,
    stream: false,
    temperature: 0.2,
    max_tokens: 2048,
  };

  const errors: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    try {
      const res = await fetchWithTimeout(
        `${OPENROUTER_BASE_URL}/api/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${keys[i]}`,
            "HTTP-Referer": process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000",
            "X-Title": "Diagramador UML colaborativo",
          },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw parseError(res, text);
      }
      const data = (await res.json()) as {
        model?: string;
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id?: string;
              type?: string;
              function?: { name?: string; arguments?: string |
                Record<string, unknown> };
            }>;
          };
        }>;
      };
      const message = data.choices?.[0]?.message;
      const toolCalls: IAToolCall[] = (message?.tool_calls ?? []).map((tc, index) => ({
        id: tc.id ?? `call-${Date.now()}-${index}`,
        type: "function",
        function: {
          name: String(tc.function?.name ?? ""),
          arguments: toJsonArgs(tc.function?.arguments),
        },
      }));
      return {
        content: message?.content ?? "",
        toolCalls,
        model: data.model,
        keyFallbacksUsed: i,
      };
    } catch (err: unknown) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(
    `OpenRouter falló con todas las ${keys.length} key(s) configuradas. Último error: ${errors[errors.length - 1] ?? "desconocido"}`
  );
}