/**
 * Fuente única de verdad de las tools del editor.
 *
 * Cada tool se declara en `tools/<nombre>.ts`. Este archivo solo las agrega y
 * deriva de ellas: schemas para el LLM, validación, ejecución, lista de
 * nombres conocidos y flags de comportamiento (visual/readOnly/destructive).
 *
 * Para agregar una tool: crear su archivo y añadirla a `TOOLS`.
 * Para quitarla: borrar su archivo y quitarla de `TOOLS`.
 */
import type { JsonSchemaObject, ToolContext, ToolResult, ValidationResult } from "../define";
import { getDiagram } from "../graphStore";
import { addClassTool } from "./addClass";
import { consultarHistorialTool } from "./consultarHistorial";
import { consultarPlanTool } from "./consultarPlan";
import { connectTool } from "./connect";
import { getStateTool } from "./getState";
import { removeClassTool } from "./removeClass";
import { replaceAllTool } from "./replaceAll";
import { updateAttributeTool } from "./updateAttribute";
import { updateClassTool } from "./updateClass";
import { updateMethodTool } from "./updateMethod";
import { updateRelationTool } from "./updateRelation";
import { validateTool } from "./validate";

export const TOOLS = [
  addClassTool,
  removeClassTool,
  updateClassTool,
  connectTool,
  updateRelationTool,
  updateAttributeTool,
  updateMethodTool,
  replaceAllTool,
  getStateTool,
  validateTool,
  consultarHistorialTool,
  consultarPlanTool,
] as const;

export type AnyTool = (typeof TOOLS)[number];

export type ToolName = AnyTool["name"];

/** Unión de los args que acepta cada tool (compatibilidad con el código existente). */
type ArgsOf<T> = T extends { execute: (args: infer A, ...rest: never[]) => unknown } ? A : never;
export type ToolArgs = ArgsOf<AnyTool>;

export interface ToolSchemaEntry {
  name: ToolName;
  description: string;
  parameters: JsonSchemaObject;
}

/** Vista con tipos borrados para despachar en runtime por nombre. */
interface ErasedTool {
  name: ToolName;
  requiresDiagram?: boolean;
  validate(raw: unknown): ValidationResult<unknown>;
  execute(args: never, ctx: ToolContext): ToolResult | Promise<ToolResult>;
}

export const TOOL_BY_NAME = Object.fromEntries(TOOLS.map((t) => [t.name, t])) as {
  [K in ToolName]: Extract<AnyTool, { name: K }>;
};

export const TOOL_SCHEMAS: ToolSchemaEntry[] = TOOLS.map(({ name, description, parameters }) => ({
  name,
  description,
  parameters,
}));

export function buildOllamaToolDefs(): Array<{ type: "function"; function: ToolSchemaEntry }> {
  return TOOL_SCHEMAS.map((fn) => ({ type: "function", function: fn }));
}

/** Nombres aceptados por el parser de fallback del loop. */
export const KNOWN_TOOL_NAMES: ReadonlySet<string> = new Set<ToolName>(TOOLS.map((t) => t.name));

/** Tools que se previsualizan en el diagrama antes de confirmar la propuesta. */
export const VISUAL_TOOL_NAMES: ReadonlySet<string> = new Set<string>(
  TOOLS.filter((t) => (t as { visual?: boolean }).visual === true).map((t) => t.name)
);

export function isVisualTool(name: string): boolean {
  return VISUAL_TOOL_NAMES.has(name);
}

/** Tools que solo leen el diagrama: se ejecutan aunque HITL esté activo. */
export const READ_ONLY_TOOL_NAMES: ReadonlySet<string> = new Set<string>(
  TOOLS.filter((t) => (t as { readOnly?: boolean }).readOnly === true).map((t) => t.name)
);

export function isReadOnlyTool(name: string): boolean {
  return READ_ONLY_TOOL_NAMES.has(name);
}

export function validateArgs(name: ToolName, raw: unknown): ValidationResult<unknown> {
  const tool = TOOL_BY_NAME[name] as ErasedTool | undefined;
  if (!tool) return { ok: false, error: `Tool desconocido: '${name}'.` };
  return tool.validate(raw);
}

export function executeTool(
  name: ToolName,
  raw: unknown,
  ctx: ToolContext = { proyectoId: null },
): ToolResult | Promise<ToolResult> {
  const tool = TOOL_BY_NAME[name] as ErasedTool | undefined;
  if (!tool) return { ok: false, error: `Tool desconocido: '${name}'.` };

  const validation = tool.validate(raw);
  if (!validation.ok) return validation;

  const requiereDiagrama = tool.requiresDiagram !== false;
  const diagram = requiereDiagrama ? getDiagram() : null;
  if (requiereDiagrama && !diagram) return { ok: false, error: "Sin diagrama activo." };

  try {
    const resultado = tool.execute(validation.value as never, ctx);
    if (esPromesa(resultado)) {
      // Solo las tools de lectura pueden llegar aquí. No hay transacción que
      // revertir en GoJS: se normaliza el error y el loop continúa.
      return resultado.catch((err: unknown) => ({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
    return resultado;
  } catch (err: unknown) {
    if (diagram?.undoManager?.currentTransaction) {
      try {
        diagram.rollbackTransaction();
      } catch {
        // el diagrama pudo quedar en un estado intermedio; se ignora
      }
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Ejecución estrictamente síncrona para escrituras y propuestas HITL.
 *
 * Si una tool devuelve una promesa se rechaza: esperar dentro de
 * `withAiOrigin` dejaría el origen de la IA abierto durante una transacción
 * humana y la bitácora atribuiría el cambio a la IA.
 */
export function executeToolSync(
  name: ToolName,
  raw: unknown,
  ctx: ToolContext = { proyectoId: null },
): ToolResult {
  const resultado = executeTool(name, raw, ctx);
  if (esPromesa(resultado)) {
    // Se consume el rechazo para que no quede como promesa no manejada; el
    // resultado ya no puede aplicarse.
    void resultado.catch(() => undefined);
    return {
      ok: false,
      error: `La herramienta '${name}' devolvió una promesa; las escrituras deben ser síncronas.`,
    };
  }
  return resultado;
}

export function esPromesa(valor: unknown): valor is Promise<ToolResult> {
  return (
    typeof valor === "object" &&
    valor !== null &&
    typeof (valor as { then?: unknown }).then === "function"
  );
}
