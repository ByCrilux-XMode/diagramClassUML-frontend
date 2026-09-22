/**
 * visionAgentLoop.ts
 * ------------------
 * Orquestador de la RUTA VISIÓN (foto de diagrama de clases → editor UML).
 * Es el "método" que el contenedor del diagrama llama cuando el usuario
 * adjunta una foto y pulsa Sintetizar/diseñar.
 *
 * CONTRATO cerrado (por qué NO es un runAgentLoop normal):
 *  - runAgentLoop exige que el LLM emita tool_calls con nuestros tools UML
 *    (addClass/connect/updateAttribute) en cada ronda. El modelo de visión
 *    (diagrams2sql) NO fue fine-tuneado para eso: inventa `addAssociation`
 *    o `add_association`, el zod de validateArgs lo rechaza, y la ronda
 *    arde. Además puede tardar 10 rondas y agotar el límite.
 *  - En cambio SÍ es estable leyendo TABLAS/COLUMNAS/RELACIONES de una foto.
 *  - Por eso la ruta visión hace UNA sola llamada sin tools (system de visión
 *    + imagen), parsea con VISION_OUTPUT_SCHEMA, valida cruces, y traduce a
 *    tool_calls con el mapper DETERMINÍSTICO visionSchemaToToolCalls.
 *    Cero rondas LLM, cero inventos, resultado siempre aplicable.
 *
 * FLUJO:
 *   1. chat visión (una llamada, sin tools) → content JSON
 *   2. VISION_OUTPUT_SCHEMA.safeParse (zod estricto)
 *   3. validateCrossReferences (relaciones huérfanas → warnings)
 *   4. visionSchemaToToolCalls → IAToolCall[] del editor
 *   5. Por cada call: validateArgs + executeTool sobre el diagrama registrado
 *      (las posiciones ya vienen en loc; el editor las respeta tal cual).
 *   6. Devuelve AgentResult con trace + warnings, igual que runAgentLoop,
 *      para que la UI (CreateProjectModal) lo consuma sin cambios de API.
 */
import type { IAProvider, IAChatMessage } from "./types";
import { VISION_SYSTEM_PROMPT, VISION_DEFAULT_MODEL } from "./visionSystemPrompt";
export { VISION_DEFAULT_MODEL };
import { VISION_OUTPUT_SCHEMA, validateCrossReferences, normalizeVisionKeys } from "./visionSchema";
import { visionSchemaToToolCalls } from "./visionSchemaToToolCalls";
import { validateArgs, executeTool } from "@/lib/editorTools";

export interface RunVisionParams {
  provider: IAProvider;
  model?: string;
  /** Imagen(es) en base64 (data URL o base64 crudo). */
  images: string[];
  /** Mensaje opcional del usuario que acompaña la foto. */
  userMessage?: string;
  onTurn?: (turn: { round: number; toolName: string; ok: boolean; error?: string }) => void;
}

export interface RunVisionResult {
  finalContent: string;
  trace: Array<{ round: number; toolName: string; ok: boolean; error?: string }>;
  warnings: string[];
  appliedSkips: Array<{ kind: string; details: string }>;
  hitlRequired: boolean;
}

function parseVisionJson(raw: string): unknown {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  try {
    // La visión a veces envuelve en ```json ... ``` o deja texto antes/despues.
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
    const body = fenced ? fenced[1].trim() : trimmed;
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    const slice = start === -1 || end === -1 || end < start ? body : body.slice(start, end + 1);
    return JSON.parse(slice) as unknown;
  } catch {
    // contenido vacio/invalido: safeParse(fallo) devuelve el error amigable
    return null;
  }
}

/**
 * Ejecuta la Ruta Visión completa. Devuelve AgentResult-compatible para que
 * la UI reutilice el trace/HITL existente sin tocar su contrato.
 */
export async function runVisionImport(params: RunVisionParams): Promise<RunVisionResult> {
  const model = params.model?.trim() || VISION_DEFAULT_MODEL;
  const system: IAChatMessage = { role: "system", content: VISION_SYSTEM_PROMPT };
  const userText = params.userMessage?.trim();
  const user: IAChatMessage = {
    role: "user",
    content: userText || "Extraé el esquema de clases de la imagen adjunta.",
    ...(params.images.length > 0 ? { images: params.images } : {}),
  };
  const messages: IAChatMessage[] = [system, user];

  // Misma vía que runAgentLoop (proxy /api/ia/chat), pero SIN tools:
  // la visión devuelve JSON neutral, no tool_calls.
  const { IA_CHAT_TIMEOUT_MS } = await import("./config");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IA_CHAT_TIMEOUT_MS);
  let content = "";
  try {
    const res = await fetch("/api/ia/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: params.provider, model, messages, tools: [] }),
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as { content?: string; error?: string };
    if (!res.ok) throw new Error(data.error ?? `El proxy IA respondió HTTP ${res.status}.`);
    content = data.content ?? "";
  } finally {
    clearTimeout(timer);
  }

  // 2) normalizar claves ES→EN + zod estricto
  const parsedRaw = parseVisionJson(content);
  const parsed = VISION_OUTPUT_SCHEMA.safeParse(normalizeVisionKeys(parsedRaw));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const detail = first
      ? `${first.path.join(".")}: ${first.message}`
      : "JSON no válido";
    return {
      finalContent: `La visión no devolvió un esquema válido (${detail}). Revisá que la foto tenga el diagrama bien iluminado y completo.`,
      trace: [],
      warnings: [],
      appliedSkips: [],
      hitlRequired: false,
    };
  }

  // 3) cruces + 4) mapper determinístico
  const crossed = validateCrossReferences(parsed.data);
  const mapped = visionSchemaToToolCalls(crossed.value);

  // 5) ejecutar cada tool call sobre el diagrama registrado
  const trace: RunVisionResult["trace"] = [];
  const warnings = [...crossed.warnings, ...mapped.warnings];
  for (const call of mapped.calls) {
    const name = call.function.name;
    const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
    const validation = validateArgs(name as never, args);
    if (!validation || !validation.ok) {
      const msg = validation && !validation.ok ? validation.error : `Tool desconocido: '${name}'`;
      trace.push({ round: 1, toolName: name, ok: false, error: msg });
      warnings.push(msg);
      continue;
    }
    const result = executeTool(name as never, validation.value as never);
    trace.push({
      round: 1,
      toolName: name,
      ok: result.ok,
      error: result.ok ? undefined : result.error,
    });
    if (!result.ok && result.error) warnings.push(result.error);
  }

  const applied = trace.filter((t) => t.ok).length;
  const skips = mapped.appliedSkips.map((s) => ({ kind: s.kind, details: s.details }));
  const finalContent =
    applied > 0
      ? `Diagrama generado desde la foto: ${applied} tool_calls aplicados${warnings.length > 0 ? ` (${warnings.length} advertencia(s), ver trace)` : ""}.`
      : "No se pudo generar nada desde la imagen. Revisá la foto y volvé a intentarlo.";

  return {
    finalContent,
    trace,
    warnings,
    appliedSkips: [...skips, ...crossed.warnings.map((w) => ({ kind: "warning", details: w }))],
    hitlRequired: false,
  };
}
