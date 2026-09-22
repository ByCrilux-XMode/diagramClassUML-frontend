import { HF_SPACE_URL, IA_CHAT_TIMEOUT_MS } from "@/lib/ia/config";
import type {
  HealthResult,
  IAChatRequestBody,
  IAChatResponse,
  IAToolCall,
} from "@/lib/ia/types";

// HF Space (deploy/hf-space) expone POST /generate {mensajes, temperatura, top_p, max_tokens} -> {texto}
// y GET /health. Es público sin token (CHRISTS20/qwn-uml-space).

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = IA_CHAT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function toJsonArgs(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v ?? {});
  } catch {
    return "{}";
  }
}

// Extrae tool_calls de un texto que puede venir como:
// - ```json {"tool_calls":[...] }``` (DSL del LoRA)
// - "Lo siento... {\"name\":\"addClass\",...}" (apology + JSON)
// - {"tool_calls":[...]} plano
// - "Clase: Usuario\nAtributos:\n- nombre: String" (fallback simple, no tool_call)
// Devuelve [] si no hay JSON parseable.
function parseTextoToToolCalls(texto: string): IAToolCall[] {
  const raw = (texto ?? "").trim();
  if (!raw) return [];

  // 1) bloque ```json ... ``` o ``` ... ```
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      const parsed = JSON.parse(fence[1].trim()) as Record<string, unknown>;
      const tcs = parsed.tool_calls ?? parsed.toolCalls;
      if (Array.isArray(tcs)) {
        return (tcs as Array<Record<string, unknown>>).map((tc, i) => {
          const fn = (tc.function ?? tc) as Record<string, unknown>;
          const name = String(fn.name ?? tc.name ?? "");
          const args = (fn.arguments ?? fn.args ?? tc.arguments ?? {}) as unknown;
          return {
            id: String((tc as Record<string, unknown>).id ?? `call-${Date.now()}-${i}`),
            type: "function" as const,
            function: { name, arguments: toJsonArgs(args) },
          };
        });
      }
      if (typeof parsed.name === "string") {
        const args = (parsed as Record<string, unknown>).args ?? (parsed as Record<string, unknown>).arguments;
        return [{ id: `call-${Date.now()}-0`, type: "function", function: { name: String(parsed.name), arguments: toJsonArgs(args) } }];
      }
    } catch {
      // fence no era JSON válido, seguir al siguiente intento
    }
  }

  // 2) busca el primer JSON que contenga "name" o "tool_calls" en cualquier parte del texto
  // (cubre "Lo siento... {\"name\":\"addClass\",...}")
  const idxName = raw.indexOf('"name"');
  const idxTools = raw.indexOf('"tool_calls"');
  let pos = -1;
  if (idxName !== -1 && idxTools !== -1) pos = Math.min(idxName, idxTools);
  else if (idxName !== -1) pos = idxName;
  else if (idxTools !== -1) pos = idxTools;
  if (pos !== -1) {
    const braceStart = raw.lastIndexOf("{", pos);
    if (braceStart !== -1) {
      let depth = 0;
      let end = -1;
      for (let i = braceStart; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      if (end !== -1) {
        try {
          const parsed = JSON.parse(raw.slice(braceStart, end + 1)) as Record<string, unknown>;
          const tcs = parsed.tool_calls ?? parsed.toolCalls;
          if (Array.isArray(tcs)) {
            return (tcs as Array<Record<string, unknown>>).map((tc, i) => {
              const fn = (tc.function ?? tc) as Record<string, unknown>;
              const name = String(fn.name ?? tc.name ?? "");
              const args = (fn.arguments ?? fn.args ?? tc.arguments ?? {}) as unknown;
              return { id: String((tc as Record<string, unknown>).id ?? `call-${Date.now()}-${i}`), type: "function" as const, function: { name, arguments: toJsonArgs(args) } };
            });
          }
          if (typeof parsed.name === "string") {
            const args = (parsed as Record<string, unknown>).args ?? (parsed as Record<string, unknown>).arguments;
            return [{ id: `call-${Date.now()}-0`, type: "function", function: { name: String(parsed.name), arguments: toJsonArgs(args) } }];
          }
        } catch {
          // ignore
        }
      }
    }
  }

  // 3) intenta parsear todo el raw como JSON directo
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const tcs = parsed.tool_calls ?? parsed.toolCalls;
    if (Array.isArray(tcs)) {
      return (tcs as Array<Record<string, unknown>>).map((tc, i) => {
        const fn = (tc.function ?? tc) as Record<string, unknown>;
        const name = String(fn.name ?? tc.name ?? "");
        const args = (fn.arguments ?? fn.args ?? tc.arguments ?? {}) as unknown;
        return { id: String((tc as Record<string, unknown>).id ?? `call-${Date.now()}-${i}`), type: "function" as const, function: { name, arguments: toJsonArgs(args) } };
      });
    }
    if (typeof parsed.name === "string") {
      const args = (parsed as Record<string, unknown>).args ?? (parsed as Record<string, unknown>).arguments;
      return [{ id: `call-${Date.now()}-0`, type: "function", function: { name: String(parsed.name), arguments: toJsonArgs(args) } }];
    }
  } catch {
    // no es JSON
  }
  return [];
}

export async function health(): Promise<HealthResult> {
  const base = HF_SPACE_URL.replace(/\/+$/, "");
  try {
    const res = await fetchWithTimeout(`${base}/health`, {}, 5000);
    if (!res.ok) return { ok: false, error: `HF Space respondió HTTP ${res.status}.` };
    const data = (await res.json()) as { status?: string; adapter?: string | null };
    if (data.status === "ok") return { ok: true };
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function listModels(): Promise<string[]> {
  // Space expone un único modelo LoRA; devolver lista estática para el selector.
  return ["CHRISTS20/qwn-uml-lora-7b-v2", "Qwen/Qwen2.5-Coder-7B-Instruct"];
}

export async function chat(req: IAChatRequestBody): Promise<IAChatResponse> {
  const base = HF_SPACE_URL.replace(/\/+$/, "");
  const url = `${base}/generate`;

  // Envía tools nativo al Space (deploy/hf-space/app.py ahora acepta `tools`)
  // El Space usa PROMPT_CORTO y los antepone en _inferir antes de apply_chat_template.
  const mensajes = req.messages.map((m) => ({
    role: m.role,
    content: m.content ?? "",
  }));

  const payload: Record<string, unknown> = {
    mensajes,
    temperatura: 0.2,
    top_p: 0.9,
    max_tokens: 512,
  };
  if (req.tools && req.tools.length > 0) {
    payload.tools = req.tools;
  }

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HF Space /generate respondió HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { texto?: string; text?: string };
  const texto = (data.texto ?? data.text ?? "") as string;
  const toolCalls = parseTextoToToolCalls(texto);

  return {
    content: texto,
    toolCalls,
    model: "CHRISTS20/qwn-uml-lora-7b-v2",
  };
}
