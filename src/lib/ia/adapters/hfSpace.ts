import {
  HF_SPACE_MODELOS,
  HF_SPACE_PROPIO_URL,
  IA_CHAT_TIMEOUT_MS,
  IA_HF_SPACE_DSL,
  IA_HF_SPACE_DSL_MAX_TOKENS,
  IA_HF_SPACE_MODEL,
  resolverSpaceHf,
} from "@/lib/ia/config";
import { diffDiagrama } from "@/lib/ia/dsl/diff";
import { construirMensajesDsl, extraerSnapshot, pedirBorrado } from "@/lib/ia/dsl/prompt";
import type { MensajeDsl } from "@/lib/ia/dsl/prompt";
import { proyectarDiagrama } from "@/lib/ia/dsl/project";
import { extraerJson } from "@/lib/ia/dsl/repair";
import { toToolCalls } from "@/lib/ia/dsl/toToolCalls";
import { validarSalida } from "@/lib/ia/dsl/validate";
import type { DiagramaCanonico } from "@/lib/ia/dsl/canonical";
import type {
  HealthResult,
  IAChatMessage,
  IAChatRequestBody,
  IAChatResponse,
  IAToolCall,
  IAToolDef,
} from "@/lib/ia/types";

// HF Space (deploy/hf-space) expone POST /generate {mensajes, temperatura, top_p, max_tokens} -> {texto}
// y GET /health. Cada modelo del selector resuelve su propia base con
// `resolverSpaceHf` (por defecto, el Space propio `piloto-qwen2.5coder`).

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
  const base = resolverSpaceHf(IA_HF_SPACE_MODEL).url.replace(/\/+$/, "");
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
  // Cada ID resuelve a un Space distinto en `chat`; el primero es el propio.
  return HF_SPACE_MODELOS.map((entrada) => entrada.id);
}

interface RespuestaGenerate {
  texto: string;
}

async function pedirGenerate(
  url: string,
  mensajes: MensajeDsl[],
  maxTokens: number,
): Promise<RespuestaGenerate> {
  const payload = {
    mensajes,
    temperatura: 0.1,
    top_p: 0.9,
    max_tokens: maxTokens,
  };
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
  return { texto: String(data.texto ?? data.text ?? "") };
}

/** Código actual: catálogo de tools en el prompt + parser JSON. Es el fallback. */
async function chatLegacy(req: IAChatRequestBody): Promise<IAChatResponse> {
  const espacio = resolverSpaceHf(req.model);
  const base = espacio.url.replace(/\/+$/, "");
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
    model: espacio.id,
  };
}

/** Tools que cambian el diagrama; su resultado cierra la ronda DSL. */
const HERRAMIENTAS_ESCRITURA: ReadonlySet<string> = new Set([
  "addClass",
  "connect",
  "removeClass",
  "replaceAll",
  "updateAttribute",
  "updateClass",
  "updateMethod",
  "updateRelation",
]);

function normalizarUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Solo el Space propio usa el DSL.
 *
 * Se comprueba la URL registrada (no el nombre del modelo) para que el Space
 * LoRA y cualquier modelo desconocido sigan por el camino legacy. Además el
 * turno debe ofrecer al menos una tool de escritura: en modo plan no aplica.
 */
export function debeUsarDsl(req: IAChatRequestBody): boolean {
  if (!IA_HF_SPACE_DSL) return false;

  const modelo = (req.model ?? "").trim().toLowerCase();
  const entrada = HF_SPACE_MODELOS.find((candidato) => candidato.id.toLowerCase() === modelo);
  if (!entrada) return false;
  if (normalizarUrl(entrada.url) !== normalizarUrl(HF_SPACE_PROPIO_URL)) return false;

  return (req.tools ?? []).some((tool) => HERRAMIENTAS_ESCRITURA.has(tool.function.name));
}

interface AnalisisRonda {
  esSegundaRonda: boolean;
  huboEscritura: boolean;
}

/** Detecta si los mensajes ya traen resultados de tools después del último user. */
export function analizarRonda(mensajes: IAChatMessage[]): AnalisisRonda {
  let ultimoUsuario = -1;
  for (let i = mensajes.length - 1; i >= 0; i -= 1) {
    if (mensajes[i].role === "user") {
      ultimoUsuario = i;
      break;
    }
  }
  if (ultimoUsuario === -1) return { esSegundaRonda: false, huboEscritura: false };

  const posteriores = mensajes.slice(ultimoUsuario + 1).filter((m) => m.role === "tool");
  if (posteriores.length === 0) return { esSegundaRonda: false, huboEscritura: false };

  const huboEscritura = posteriores.some((m) => HERRAMIENTAS_ESCRITURA.has(m.name ?? ""));
  return { esSegundaRonda: true, huboEscritura };
}

function ultimoContenidoAsistente(mensajes: IAChatMessage[]): string {
  for (let i = mensajes.length - 1; i >= 0; i -= 1) {
    if (mensajes[i].role === "assistant") return mensajes[i].content ?? "";
  }
  return "";
}

/** El Space solo acepta system/user/assistant: convierte los `tool` a `user`. */
function sinMensajesTool(req: IAChatRequestBody): IAChatRequestBody {
  if (!req.messages.some((mensaje) => mensaje.role === "tool")) return req;
  return {
    ...req,
    messages: req.messages.map((mensaje) =>
      mensaje.role === "tool"
        ? {
            role: "user",
            content: `Resultado de la herramienta${
              mensaje.name ? ` de ${mensaje.name}` : ""
            }:\n${mensaje.content ?? ""}`,
          }
        : mensaje,
    ),
  };
}

/**
 * Rama DSL: el modelo devuelve el diagrama completo y el frontend calcula el
 * diff. Si el contrato falla dos veces, se cae al parser JSON actual.
 */
async function chatDsl(req: IAChatRequestBody, espacio: ReturnType<typeof resolverSpaceHf>): Promise<IAChatResponse> {
  const sistema = req.messages.find((m) => m.role === "system")?.content ?? "";
  const snapshot = extraerSnapshot(sistema);
  if (!snapshot) return chatLegacy(sinMensajesTool(req));

  const proyeccion = proyectarDiagrama(snapshot);
  const mensajes = construirMensajesDsl(req.messages, proyeccion.diagrama);
  const base = espacio.url.replace(/\/+$/, "");
  const url = `${base}/generate`;
  const maxTokens =
    Number.isFinite(IA_HF_SPACE_DSL_MAX_TOKENS) && IA_HF_SPACE_DSL_MAX_TOKENS > 0
      ? IA_HF_SPACE_DSL_MAX_TOKENS
      : 1536;

  const primera = await pedirGenerate(url, mensajes, maxTokens);
  let validada = validarSalida(extraerJson(primera.texto));

  if (!validada.ok) {
    const maxTokensReintento = Math.min(maxTokens * 2, 4096);
    const reintento: MensajeDsl[] = [
      ...mensajes,
      { role: "assistant", content: primera.texto || "(respuesta vacía)" },
      {
        role: "user",
        content: `Tu respuesta no cumplió el contrato: ${validada.error}\nDevuelve SOLO el objeto JSON completo y corregido.`,
      },
    ];
    try {
      const segunda = await pedirGenerate(url, reintento, maxTokensReintento);
      validada = validarSalida(extraerJson(segunda.texto));
    } catch {
      return chatLegacy(sinMensajesTool(req));
    }
  }

  if (!validada.ok) return chatLegacy(sinMensajesTool(req));
  const salida = validada.value;

  if (salida.tipo === "consulta") {
    const consultas = salida.consultas ?? [];
    const toolCalls: IAToolCall[] = consultas.map((consulta, indice) => ({
      id: `dsl-consulta-${indice + 1}`,
      type: "function",
      function: {
        name: consulta.herramienta,
        arguments: JSON.stringify(consulta.args ?? {}),
      },
    }));
    return {
      content: salida.mensaje || "Necesito consultar antes de editar.",
      toolCalls,
      model: espacio.id,
    };
  }

  if (salida.tipo === "chat") {
    return { content: salida.mensaje, toolCalls: [], model: espacio.id };
  }

  const deseado: DiagramaCanonico = {
    entidades: salida.entidades ?? [],
    relaciones: salida.relacionesOmitidas
      ? proyeccion.diagrama.relaciones
      : (salida.relaciones ?? []),
  };
  const diff = diffDiagrama(proyeccion, deseado, {
    permitirBorrado: pedirBorrado(req.messages),
  });
  const toolCalls = toToolCalls(diff);
  const avisos = diff.advertencias.length > 0 ? `\n\n${diff.advertencias.join("\n")}` : "";
  const baseMensaje =
    salida.mensaje.trim() ||
    (toolCalls.length > 0 ? "Actualicé el diagrama." : "No hay cambios que aplicar.");

  return {
    content: `${baseMensaje}${avisos}`,
    toolCalls,
    model: espacio.id,
  };
}

export async function chat(req: IAChatRequestBody): Promise<IAChatResponse> {
  const espacio = resolverSpaceHf(req.model);

  if (!debeUsarDsl(req)) return chatLegacy(req);

  const ronda = analizarRonda(req.messages);
  // En la segunda ronda el agentLoop ya recibió las propuestas de escritura.
  // Devolver el mismo content sin toolCalls evita duplicarlas.
  if (ronda.esSegundaRonda && ronda.huboEscritura) {
    return {
      content:
        ultimoContenidoAsistente(req.messages).trim() ||
        "Propuesta lista para revisión humana.",
      toolCalls: [],
      model: espacio.id,
    };
  }

  return chatDsl(req, espacio);
}
