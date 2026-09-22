import { HF_BASE_URL, HF_MODELS_URL, HF_TOKEN, IA_CHAT_TIMEOUT_MS } from "@/lib/ia/config";
import type {
  HealthResult,
  IAChatRequestBody,
  IAChatResponse,
  IAToolCall,
  IAToolDef,
} from "@/lib/ia/types";

const CURATED_MODELS = [
  "meta-llama/Llama-3.1-8B-Instruct",
  "Qwen/Qwen3.8-27B",
  "openai/gpt-oss-120b",
];

interface RawChoice {
  message?: {
    content?: string | null;
    tool_calls?: Array<{
      id?: string;
      type?: string;
      function?: { name?: string; arguments?: string | Record<string, unknown> };
    }>;
  };
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

function parseHfError(res: Response, text: string): Error {
  let detail = text || `HTTP ${res.status}`;
  try {
    const parsed = JSON.parse(text) as { error?: string };
    if (typeof parsed.error === "string") detail = parsed.error;
  } catch {
    // se mantiene el texto crudo
  }
  return new Error(`Hugging Face respondió HTTP ${res.status}: ${detail.slice(0, 300)}`);
}

function isEndpointUrl(model: string): boolean {
  return model.includes(".endpoints.huggingface.cloud");
}

export async function health(): Promise<HealthResult> {
  if (!HF_TOKEN) {
    return {
      ok: false,
      error: "Falta HF_TOKEN en el servidor (server-side). Configúralo para usar Hugging Face.",
    };
  }
  return { ok: true };
}

interface RouterProviderInfo {
  supports_tools?: boolean;
}

/** True si el modelo puede llamar herramientas. Sin info de providers → se
 *  deja pasar (no se puede comprobar). */
function supportsTools(item: { providers?: RouterProviderInfo[] }): boolean {
  const providers = item.providers;
  if (!Array.isArray(providers) || providers.length === 0) return true;
  return providers.some((p) => p.supports_tools === true);
}

/** Tope del dropdown para que no salga "la millonada" completa. El modo de
 *  entrada libre permite escribir cualquier modelo a mano. */
const MAX_LISTED_MODELS = 40;

export async function listModels(): Promise<string[]> {
  const result = new Set<string>(CURATED_MODELS);
  if (HF_TOKEN) {
    try {
      const res = await fetchWithTimeout(
        HF_MODELS_URL,
        { headers: { Authorization: `Bearer ${HF_TOKEN}` } },
        10000
      );
      if (res.ok) {
        const json = (await res.json()) as
          | Array<{ id?: string } & { providers?: RouterProviderInfo[] }>
          | { data?: Array<{ id?: string } & { providers?: RouterProviderInfo[] }> };
        const items = (Array.isArray(json) ? json : json.data ?? []) as Array<{
          id?: string;
          providers?: RouterProviderInfo[];
        }>;
        for (const item of items.slice(0, MAX_LISTED_MODELS)) {
          if (typeof item.id === "string" && item.id && supportsTools(item)) {
            result.add(item.id);
          }
        }
      }
    } catch {
      // sin conexión al Hub: se devuelve la lista curada
    }
  }
  return [...result];
}

/**
 * Las fotos llegan como base64 crudo (el modal comprime a JPEG y corta el
 * prefijo data:). El formato OpenAI vision exige data URL completa.
 */
function toImageUrl(img: string): string {
  const trimmed = img.trim();
  if (/^data:image\/[a-z+]+;base64,/i.test(trimmed)) return trimmed;
  return `data:image/jpeg;base64,${trimmed}`;
}

function toHfMessages(messages: IAChatRequestBody["messages"]): unknown[] {
  return messages.map((m) => {
    // Visión: contenido multipart (texto + image_url), formato OpenAI.
    // Solo tiene efecto si el modelo destino es de visión; si no, el
    // provider lo rechaza con error claro en vez de ignorar la foto.
    if ((m.role === "user" || m.role === "system") && Array.isArray(m.images) && m.images.length > 0) {
      return {
        role: m.role,
        content: [
          { type: "text", text: m.content ?? "" },
          ...m.images.map((img) => ({ type: "image_url", image_url: { url: toImageUrl(img) } })),
        ],
      };
    }
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

/**
 * Resuelve a dónde pegar según `model`:
 *  - URL completa (https://...) → servidor OpenAI-compatible propio
 *    (llama-server, Space Docker, Codespaces, VPS). Sin auth salvo que haya token.
 *  - *.endpoints.huggingface.cloud → Inference Endpoint (requiere token).
 *  - nombre de modelo → Inference API serverless (requiere token).
 */
function resolveEndpoint(model: string): { url: string; payloadModel: string; needAuth: boolean } {
  const trimmed = model.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) {
    return { url: `${trimmed}/v1/chat/completions`, payloadModel: "model", needAuth: false };
  }
  if (isEndpointUrl(trimmed)) {
    return { url: `${trimmed}/v1/chat/completions`, payloadModel: "text-generation", needAuth: true };
  }
  return { url: `${HF_BASE_URL}/v1/chat/completions`, payloadModel: trimmed, needAuth: true };
}

export async function chat(req: IAChatRequestBody): Promise<IAChatResponse> {
  const endpoint = resolveEndpoint(req.model);
  if (endpoint.needAuth && !HF_TOKEN) {
    throw new Error("Falta HF_TOKEN en el servidor para el proveedor Hugging Face.");
  }

  const payload = {
    model: endpoint.payloadModel,
    messages: toHfMessages(req.messages),
    tools: req.tools as IAToolDef[],
    tool_choice: "auto",
    stream: false,
    temperature: 0.2,
    max_tokens: 2048,
  };

  const res = await fetchWithTimeout(endpoint.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw parseHfError(res, text);
  }

  const data = (await res.json()) as {
    model?: string;
    choices?: RawChoice[];
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
  };
}