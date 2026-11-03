import * as go from "gojs";
import type { NodeCategory } from "@/types/uml";
import type { ValidationResult } from "../define";
import { fail, isObject } from "../define";
import type { ToolDef } from "../define";
import { findNodeData, requireDiagram } from "../helpers";

export interface UpdateClassArgs {
  key: string;
  name?: string;
  isAbstract?: boolean;
  literals?: string[];
}

export const updateClassTool = {
  name: "updateClass",
  description:
    "Actualiza metadatos de una clase existente: nombre visible, si es abstracta (solo Class) o literales (solo Enum). No cambia la clave ni la categoría. Requiere al menos un campo a cambiar.",
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Clave de la clase a modificar." },
      name: { type: "string", description: "Nuevo nombre visible (opcional)." },
      isAbstract: { type: "boolean", description: "Marcar/desmarcar como abstracta. Solo para category Class." },
      literals: { type: "array", items: { type: "string" }, description: "Nuevos literales. Solo para category Enum." },
    },
    required: ["key"],
  },

  validate(raw: unknown): ValidationResult<UpdateClassArgs> {
    if (!isObject(raw)) return fail("Los argumentos deben ser un objeto.");
    const key = raw.key;
    if (typeof key !== "string" || key.trim() === "") return fail("'key' es obligatorio y debe ser texto.");

    const hasName = raw.name !== undefined;
    const hasAbstract = raw.isAbstract !== undefined;
    const hasLiterals = raw.literals !== undefined;
    if (!hasName && !hasAbstract && !hasLiterals) {
      return fail("Indica al menos uno de 'name', 'isAbstract' o 'literals'.");
    }
    if (hasName && (typeof raw.name !== "string" || raw.name.trim() === "")) {
      return fail("'name' debe ser texto no vacío.");
    }
    if (hasAbstract && typeof raw.isAbstract !== "boolean") {
      return fail("'isAbstract' debe ser booleano.");
    }
    if (hasLiterals && !Array.isArray(raw.literals)) {
      return fail("'literals' debe ser un array de strings.");
    }

    const value: UpdateClassArgs = {
      key,
      ...(hasName ? { name: raw.name as string } : {}),
      ...(hasAbstract ? { isAbstract: raw.isAbstract as boolean } : {}),
      ...(hasLiterals
        ? { literals: (raw.literals as unknown[]).filter((x): x is string => typeof x === "string") }
        : {}),
    };
    return { ok: true, value };
  },

  execute(args: UpdateClassArgs) {
    const diagram = requireDiagram();
    const model = diagram.model as go.GraphLinksModel;
    const node = findNodeData(diagram, args.key);
    if (!node) return { ok: false, error: `No se encontró la clase con clave '${args.key}'.` };

    const category = node["category"] as NodeCategory;
    if (args.isAbstract !== undefined && category !== "Class") {
      return { ok: false, error: `'isAbstract' solo aplica a clases (la clase '${args.key}' es ${category}).` };
    }
    if (args.literals !== undefined && category !== "Enum") {
      return { ok: false, error: `'literals' solo aplica a enumeraciones (la clase '${args.key}' es ${category}).` };
    }

    const changed: Record<string, unknown> = { key: args.key };
    diagram.startTransaction("tool-updateClass");
    try {
      if (args.name !== undefined) {
        model.setDataProperty(node, "name", args.name);
        changed.name = args.name;
      }
      if (args.isAbstract !== undefined) {
        model.setDataProperty(node, "isAbstract", args.isAbstract);
        changed.isAbstract = args.isAbstract;
      }
      if (args.literals !== undefined) {
        model.setDataProperty(node, "literals", args.literals);
        changed.literals = args.literals;
      }
    } finally {
      diagram.commitTransaction("tool-updateClass");
    }
    return { ok: true, message: "Clase actualizada.", data: changed };
  },
} satisfies ToolDef<UpdateClassArgs, "updateClass">;
