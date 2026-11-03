import type { ValidationResult } from "../define";
import { fail, isObject } from "../define";
import type { ToolDef } from "../define";
import { requireDiagram } from "../helpers";
import { serializeDiagramState } from "../state";

export type GetStateArgs = Record<string, never>;

export const getStateTool = {
  name: "getState",
  description:
    "Devuelve el estado actual del diagrama en JSON compacto: clases (key, nombre, categoría, miembros) y relaciones (key, extremos, tipo, multiplicidades). Úsala si necesitas releer el diagrama antes de editarlo.",
  readOnly: true,
  parameters: { type: "object", properties: {} },

  validate(raw: unknown): ValidationResult<GetStateArgs> {
    if (!isObject(raw)) return fail("Los argumentos deben ser un objeto.");
    return { ok: true, value: {} };
  },

  execute() {
    const state = serializeDiagramState(requireDiagram());
    return {
      ok: true,
      message: `${state.classes.length} clase(s), ${state.links.length} relación(es).`,
      data: { classes: state.classes, links: state.links },
    };
  },
} satisfies ToolDef<GetStateArgs, "getState">;
