import * as go from "gojs";
import type { AttributeData } from "@/types/uml";
import type { ValidationResult } from "../define";
import { fail, isObject } from "../define";
import type { ToolDef } from "../define";
import { VISIBILITY_ENUM, buildAttributeData, findNodeData, requireDiagram } from "../helpers";

export interface UpdateAttributeArgs {
  classKey: string;
  action: "add" | "remove" | "update";
  attribute?: Partial<AttributeData>;
  index?: number;
}

export const updateAttributeTool = {
  name: "updateAttribute",
  description:
    "Agrega, elimina o actualiza un atributo de una clase. 'add' agrega al final; 'remove' elimina por índice o por nombre; 'update' reemplaza por índice o por nombre.",
  parameters: {
    type: "object",
    properties: {
      classKey: { type: "string", description: "Clave de la clase a modificar." },
      action: { type: "string", enum: ["add", "remove", "update"] },
      attribute: {
        type: "object",
        description: "Atributo involucrado (obligatorio para 'add' y 'update').",
        properties: {
          name: { type: "string" },
          type: { type: "string" },
          visibility: { type: "string", enum: VISIBILITY_ENUM },
          multiplicity: { type: "string" },
          defaultValue: { type: "string" },
          isStatic: { type: "boolean" },
          isDerived: { type: "boolean" },
          isReadOnly: { type: "boolean" },
        },
        required: ["name"],
      },
      index: { type: "number", description: "Índice del atributo en el array (opcional)." },
    },
    required: ["classKey", "action"],
  },

  validate(raw: unknown): ValidationResult<UpdateAttributeArgs> {
    if (!isObject(raw)) return fail("Los argumentos deben ser un objeto.");
    const classKey = raw.classKey;
    const action = raw.action;
    if (typeof classKey !== "string" || classKey.trim() === "") return fail("'classKey' es obligatorio y debe ser texto.");
    if (action !== "add" && action !== "remove" && action !== "update") {
      return fail("'action' debe ser 'add', 'remove' o 'update'.");
    }
    if (
      (action === "add" || action === "update") &&
      (!isObject(raw.attribute) || typeof raw.attribute.name !== "string" || raw.attribute.name.trim() === "")
    ) {
      return fail("'attribute' (objeto con 'name') es obligatorio para 'add' y 'update'.");
    }
    const value: UpdateAttributeArgs = {
      classKey,
      action,
      ...(isObject(raw.attribute)
        ? { attribute: raw.attribute as unknown as Partial<AttributeData> }
        : {}),
      ...(typeof raw.index === "number" ? { index: raw.index } : {}),
    };
    return { ok: true, value };
  },

  execute(args: UpdateAttributeArgs) {
    const diagram = requireDiagram();
    const model = diagram.model as go.GraphLinksModel;
    const node = findNodeData(diagram, args.classKey);
    if (!node) return { ok: false, error: `No se encontró la clase con clave '${args.classKey}'.` };
    const current = Array.isArray(node["attributes"]) ? (node["attributes"] as AttributeData[]) : [];
    let next: AttributeData[];
    if (args.action === "add") {
      if (!args.attribute || !args.attribute.name) {
        return { ok: false, error: "El atributo requiere un nombre." };
      }
      next = [...current, buildAttributeData(args.attribute)];
    } else if (args.action === "remove") {
      const index = args.index ?? current.findIndex((a) => a.name === args.attribute?.name);
      if (index < 0 || index >= current.length) {
        return { ok: false, error: "No se encontró el atributo a eliminar." };
      }
      next = current.filter((_, i) => i !== index);
    } else {
      const attribute = args.attribute;
      if (!attribute || !attribute.name) {
        return { ok: false, error: "El atributo requiere un nombre." };
      }
      const index = args.index ?? current.findIndex((a) => a.name === attribute.name);
      if (index < 0 || index >= current.length) {
        return { ok: false, error: "No se encontró el atributo a actualizar." };
      }
      next = current.slice();
      next[index] = buildAttributeData(attribute);
    }
    diagram.startTransaction("tool-updateAttribute");
    model.setDataProperty(node, "attributes", next);
    diagram.commitTransaction("tool-updateAttribute");
    return {
      ok: true,
      message: "Atributos actualizados.",
      data: { classKey: args.classKey, attributes: next },
    };
  },
} satisfies ToolDef<UpdateAttributeArgs, "updateAttribute">;
