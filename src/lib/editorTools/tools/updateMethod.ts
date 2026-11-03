import * as go from "gojs";
import type { MethodData, ParameterDirection } from "@/types/uml";
import type { ValidationResult } from "../define";
import { fail, isObject } from "../define";
import type { ToolDef } from "../define";
import { DIRECTION_ENUM, VISIBILITY_ENUM, findNodeData, requireDiagram, toMethodData } from "../helpers";

export interface UpdateMethodArgs {
  classKey: string;
  action: "add" | "remove" | "update";
  method?: Partial<MethodData> & { name: string };
  index?: number;
}

export const updateMethodTool = {
  name: "updateMethod",
  description:
    "Agrega, elimina o actualiza un método de una clase existente. 'add' agrega al final; 'remove' elimina por índice o por nombre; 'update' reemplaza por índice o por nombre. Usa este tool para añadir métodos a clases ya creadas, no addClass.",
  parameters: {
    type: "object",
    properties: {
      classKey: { type: "string", description: "Clave de la clase a modificar." },
      action: { type: "string", enum: ["add", "remove", "update"] },
      method: {
        type: "object",
        description: "Método involucrado (obligatorio para 'add' y 'update').",
        properties: {
          name: { type: "string" },
          visibility: { type: "string", enum: VISIBILITY_ENUM },
          parameters: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: { type: "string" },
                direction: { type: "string", enum: DIRECTION_ENUM },
              },
              required: ["name", "type"],
            },
          },
          returnType: { type: "string" },
        },
        required: ["name"],
      },
      index: { type: "number", description: "Índice del método en el array (opcional)." },
    },
    required: ["classKey", "action"],
  },

  validate(raw: unknown): ValidationResult<UpdateMethodArgs> {
    if (!isObject(raw)) return fail("Los argumentos deben ser un objeto.");
    const classKey = raw.classKey;
    const action = raw.action;
    if (typeof classKey !== "string" || classKey.trim() === "") return fail("'classKey' es obligatorio y debe ser texto.");
    if (action !== "add" && action !== "remove" && action !== "update") {
      return fail("'action' debe ser 'add', 'remove' o 'update'.");
    }
    if (
      (action === "add" || action === "update") &&
      (!isObject(raw.method) || typeof raw.method.name !== "string" || raw.method.name.trim() === "")
    ) {
      return fail("'method' (objeto con 'name') es obligatorio para 'add' y 'update'.");
    }
    const value: UpdateMethodArgs = {
      classKey,
      action,
      ...(isObject(raw.method)
        ? { method: raw.method as unknown as Partial<MethodData> & { name: string } }
        : {}),
      ...(typeof raw.index === "number" ? { index: raw.index } : {}),
    };
    return { ok: true, value };
  },

  execute(args: UpdateMethodArgs) {
    const diagram = requireDiagram();
    const model = diagram.model as go.GraphLinksModel;
    const node = findNodeData(diagram, args.classKey);
    if (!node) return { ok: false, error: `No se encontró la clase con clave '${args.classKey}'.` };
    const current = Array.isArray(node["methods"]) ? (node["methods"] as MethodData[]) : [];
    let next: MethodData[];
    if (args.action === "add") {
      if (!args.method || !args.method.name) return { ok: false, error: "El método requiere un nombre." };
      next = [
        ...current,
        toMethodData({
          name: args.method.name,
          visibility: args.method.visibility,
          parameters: args.method.parameters as Array<{ name: string; type: string; direction?: ParameterDirection }>,
          returnType: args.method.returnType,
        }),
      ];
    } else if (args.action === "remove") {
      const index = args.index ?? current.findIndex((m) => m.name === args.method?.name);
      if (index < 0 || index >= current.length) return { ok: false, error: "No se encontró el método a eliminar." };
      next = current.filter((_, i) => i !== index);
    } else {
      const method = args.method;
      if (!method || !method.name) return { ok: false, error: "El método requiere un nombre." };
      const index = args.index ?? current.findIndex((m) => m.name === method.name);
      if (index < 0 || index >= current.length) return { ok: false, error: "No se encontró el método a actualizar." };
      next = current.slice();
      next[index] = toMethodData({
        name: method.name,
        visibility: method.visibility,
        parameters: method.parameters as Array<{ name: string; type: string; direction?: ParameterDirection }>,
        returnType: method.returnType,
      });
    }
    diagram.startTransaction("tool-updateMethod");
    model.setDataProperty(node, "methods", next);
    diagram.commitTransaction("tool-updateMethod");
    return { ok: true, message: "Métodos actualizados.", data: { classKey: args.classKey, methods: next } };
  },
} satisfies ToolDef<UpdateMethodArgs, "updateMethod">;
