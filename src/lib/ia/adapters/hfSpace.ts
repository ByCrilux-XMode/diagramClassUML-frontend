import { HF_SPACE_URL, IA_CHAT_TIMEOUT_MS } from "@/lib/ia/config";
import type {
  HealthResult,
  IAChatRequestBody,
  IAChatResponse,
  IAToolCall,
  IAToolDef,
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

interface MensajePlano {
  role: string;
  content: string;
}

/**
 * Algunos Spaces solo aceptan `{mensajes, temperatura, top_p, max_tokens}` e
 * ignoran el campo `tools`. Para que el modelo sepa qué herramientas existen,
 * el catálogo viaja dentro del system prompt y se le pide un JSON reconocible.
 */
export function mensajesConHerramientas(
  mensajes: MensajePlano[],
  tools: IAToolDef[],
): MensajePlano[] {
  if (tools.length === 0) return mensajes;

  const catalogo = tools.map((tool) => JSON.stringify(tool.function)).join("\n");
  const instruccion = [
    "Herramientas disponibles (una por línea, con sus parámetros):",
    catalogo,
    "",
    "Cuando la persona pida crear, modificar o eliminar algo del diagrama, responde SOLO con este bloque, sin explicaciones:",
    "```json",
    '{"tool_calls":[{"name":"<herramienta>","arguments":{...}}]}',
    "```",
    "Usa exactamente los nombres y campos del catálogo y las claves de clases que aparecen en el contexto. No inventes claves ni nombres de herramientas. Si solo te hacen una pregunta, responde en texto normal.",
  ].join("\n");

  const indiceSistema = mensajes.findIndex((mensaje) => mensaje.role === "system");
  if (indiceSistema === -1) {
    return [{ role: "system", content: instruccion }, ...mensajes];
  }
  return mensajes.map((mensaje, indice) =>
    indice === indiceSistema
      ? { ...mensaje, content: `${mensaje.content}\n\n${instruccion}` }
      : mensaje,
  );
}

function llamadaDesdeObjeto(valor: unknown, indice: number): IAToolCall | null {
  if (typeof valor !== "object" || valor === null) return null;
  const objeto = valor as Record<string, unknown>;
  const funcion = (
    typeof objeto.function === "object" && objeto.function !== null ? objeto.function : objeto
  ) as Record<string, unknown>;
  const name = String(funcion.name ?? objeto.name ?? "").trim();
  if (!name) return null;
  const args = funcion.arguments ?? funcion.args ?? objeto.arguments ?? objeto.args ?? {};
  return {
    id: String(objeto.id ?? `call-${Date.now()}-${indice}`),
    type: "function",
    function: { name, arguments: toJsonArgs(args) },
  };
}

function llamadasDeArreglo(valor: unknown): IAToolCall[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((item, indice) => llamadaDesdeObjeto(item, indice))
    .filter((llamada): llamada is IAToolCall => llamada !== null);
}

function llamadasDeJson(texto: string): IAToolCall[] {
  try {
    const parsed: unknown = JSON.parse(texto);
    if (typeof parsed !== "object" || parsed === null) return [];
    const objeto = parsed as Record<string, unknown>;
    const toolCalls = objeto.tool_calls ?? objeto.toolCalls;
    if (Array.isArray(toolCalls)) return llamadasDeArreglo(toolCalls);
    const unica = llamadaDesdeObjeto(objeto, 0);
    return unica ? [unica] : [];
  } catch {
    return [];
  }
}

/** Extrae objetos JSON balanceados de un texto (ignora llaves dentro de cadenas). */
function objetosJson(texto: string): string[] {
  const objetos: string[] = [];
  let indice = 0;
  while (indice < texto.length) {
    const inicio = texto.indexOf("{", indice);
    if (inicio === -1) break;
    let profundidad = 0;
    let fin = -1;
    let enCadena = false;
    let escape = false;
    for (let i = inicio; i < texto.length; i++) {
      const caracter = texto[i];
      if (enCadena) {
        if (escape) escape = false;
        else if (caracter === "\\") escape = true;
        else if (caracter === '"') enCadena = false;
        continue;
      }
      if (caracter === '"') enCadena = true;
      else if (caracter === "{") profundidad++;
      else if (caracter === "}") {
        profundidad--;
        if (profundidad === 0) {
          fin = i;
          break;
        }
      }
    }
    if (fin === -1) break;
    objetos.push(texto.slice(inicio, fin + 1));
    indice = fin + 1;
  }
  return objetos;
}

function deduplicar(llamadas: IAToolCall[]): IAToolCall[] {
  const vistas = new Set<string>();
  return llamadas.filter((llamada) => {
    const clave = `${llamada.function.name}|${llamada.function.arguments}`;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
}

/**
 * El Space puede devolver tool calls como JSON, en un bloque ```json, o en un
 * `<tool_calls>` con varios objetos separados por saltos de línea. Se aceptan
 * todos esos formatos y se conservan todas las llamadas, no solo la primera.
 */
export function parseTextoToToolCalls(texto: string): IAToolCall[] {
  const raw = (texto ?? "").trim();
  if (!raw) return [];

  // 1) Bloque de código: suele envolver {"tool_calls":[...]} o un arreglo.
  for (const bloque of raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const encontradas = llamadasDeJson(bloque[1].trim());
    if (encontradas.length > 0) return encontradas;
  }

  // 2) Todo el texto como JSON.
  const directas = llamadasDeJson(raw);
  if (directas.length > 0) return directas;

  // 3) `<tool_calls>` con varios objetos, o JSON suelto dentro de una frase.
  return deduplicar(objetosJson(raw).flatMap((objeto) => llamadasDeJson(objeto)));
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

  // Si el Space ignora `tools`, el catálogo va en el prompt y el modelo
  // devuelve un JSON que `parseTextoToToolCalls` reconoce.
  const mensajes = mensajesConHerramientas(
    req.messages.map((m) => ({ role: m.role, content: m.content ?? "" })),
    req.tools ?? [],
  );

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
