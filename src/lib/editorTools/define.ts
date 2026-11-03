/**
 * Contrato único de una tool del editor.
 *
 * Cada tool vive en `editorTools/tools/<nombre>.ts` y declara aquí su schema
 * (lo que ve el LLM), su validación y su ejecución. Todo lo demás —schemas,
 * parser de fallback, preview, etiquetas de UI— se deriva del registry
 * (`editorTools/tools/index.ts`).
 */

export interface ToolResult {
  ok: boolean;
  error?: string; // mensaje si falló
  message?: string; // humano (español), si ok
  data?: Record<string, unknown>; // serializable (JSON)
}

export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export type ValidationResult<A> = { ok: true; value: A } | { ok: false; error: string };

/**
 * Metadatos de comportamiento (no de presentación).
 * Las etiquetas humanas viven en la UI (`AsistentePanel`), no en la tool.
 */
export interface ToolBehavior {
  /** Participa del ghost preview y se aplica al confirmar la propuesta. */
  visual?: boolean;
  /** No modifica el diagrama. */
  readOnly?: boolean;
  /** Puede destruir información; la UI puede pedir confirmación extra. */
  destructive?: boolean;
}

/**
 * Contexto de ejecución explícito.
 *
 * Las tools de consulta necesitan el proyecto del turno para llamar a Nest.
 * Se pasa por parámetro, no por estado global: dos pestañas o dos turnos
 * simultáneos no deben compartir el proyecto activo.
 */
export interface ToolContext {
  proyectoId: number | string | null;
}

export interface ToolDef<A, N extends string = string> extends ToolBehavior {
  name: N;
  description: string;
  parameters: JsonSchemaObject;
  /**
   * Requiere un diagrama GoJS montado. Por defecto `true`; las tools de
   * consulta (`consultarHistorial`, `consultarPlan`) no lo necesitan.
   */
  requiresDiagram?: boolean;
  validate(raw: unknown): ValidationResult<A>;
  /**
   * Las escrituras deben devolver un `ToolResult` de forma síncrona: se
   * ejecutan dentro de `withAiOrigin` y un `await` intermedio dejaría el
   * origen de la IA abierto durante una transacción humana. Solo las tools
   * `readOnly` pueden devolver una promesa.
   */
  execute(args: A, ctx: ToolContext): ToolResult | Promise<ToolResult>;
}

export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
