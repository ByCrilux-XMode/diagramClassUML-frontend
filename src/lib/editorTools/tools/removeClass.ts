import * as go from "gojs";
import type { ValidationResult } from "../define";
import { fail, isObject } from "../define";
import type { ToolDef } from "../define";
import { findNodeData, requireDiagram } from "../helpers";

export interface RemoveClassArgs {
  key: string;
}

export const removeClassTool = {
  name: "removeClass",
  description:
    "Elimina una clase (y sus relaciones conectadas) del diagrama buscándola por su clave.",
  destructive: true,
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Clave de la clase a eliminar." },
    },
    required: ["key"],
  },

  validate(raw: unknown): ValidationResult<RemoveClassArgs> {
    if (!isObject(raw)) return fail("Los argumentos deben ser un objeto.");
    const key = raw.key;
    if (typeof key !== "string" || key.trim() === "") return fail("'key' es obligatorio y debe ser texto.");
    return { ok: true, value: { key } };
  },

  execute(args: RemoveClassArgs) {
    const diagram = requireDiagram();
    const model = diagram.model as go.GraphLinksModel;
    const node = findNodeData(diagram, args.key);
    if (!node) return { ok: false, error: `No se encontró la clase con clave '${args.key}'.` };
    diagram.startTransaction("tool-removeClass");
    model.removeNodeData(node);
    diagram.commitTransaction("tool-removeClass");
    return { ok: true, message: "Clase eliminada.", data: { removedKey: args.key } };
  },
} satisfies ToolDef<RemoveClassArgs, "removeClass">;
