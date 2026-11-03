import * as go from "gojs";
import type { ParameterDirection, Visibility } from "@/types/uml";
import type { ValidationResult } from "../define";
import { fail, isObject } from "../define";
import type { ToolDef } from "../define";
import {
  DIRECTION_ENUM,
  VISIBILITY_ENUM,
  isValidLoc,
  nextGridLoc,
  normalizeKey,
  requireDiagram,
  toAttributeData,
  toMethodData,
} from "../helpers";

export interface AddClassArgs {
  key: string;
  name: string;
  loc?: string;
  category?: "Class" | "Interface" | "Enum";
  isAbstract?: boolean;
  literals?: string[];
  attributes?: Array<{ name: string; type?: string; visibility?: Visibility }>;
  methods?: Array<{
    name: string;
    visibility?: Visibility;
    parameters?: Array<{ name: string; type: string; direction?: ParameterDirection }>;
    returnType?: string;
  }>;
}

export const addClassTool = {
  name: "addClass",
  description:
    "Crea una clase UML. Puedes indicar 'loc' como 'x y' para posicionarla; si no la das, se auto-posiciona en grilla. La IA debe elegir ubicaciones distribuidas (ej. grilla 3 cols, gap 320x190 alrededor de 0,0) para evitar que todas queden apiladas. Si la clave ya existe, falla.",
  visual: true,
  parameters: {
    type: "object",
    properties: {
      key: { type: "string", description: "Identificador único y estable de la clase, ej. 'usuario'." },
      name: { type: "string", description: "Nombre visible de la clase, ej. 'Usuario'." },
      loc: { type: "string", description: "Posición opcional 'x y' en coordenadas del diagrama (ej. '0 0', '320 0', '0 190'). Si no se provee, GoJS la auto-posiciona en grilla. La IA debe decidir ubicaciones distribuidas para evitar solapamiento." },
      category: { type: "string", enum: ["Class", "Interface", "Enum"], description: "Categoría del nodo (por defecto Class). Usa Interface para interfaces y Enum para enumeraciones." },
      isAbstract: { type: "boolean", description: "Si es clase abstracta (solo para Class)." },
      literals: { type: "array", items: { type: "string" }, description: "Literales para Enum (ej. [\"PENDIENTE\", \"CONFIRMADA\"])." },
      attributes: {
        type: "array",
        description: "Lista de atributos iniciales de la clase.",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            type: { type: "string" },
            visibility: { type: "string", enum: VISIBILITY_ENUM },
          },
          required: ["name"],
        },
      },
      methods: {
        type: "array",
        description: "Lista de métodos iniciales de la clase.",
        items: {
          type: "object",
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
      },
    },
    required: ["key", "name"],
  },

  validate(raw: unknown): ValidationResult<AddClassArgs> {
    if (!isObject(raw)) return fail("Los argumentos deben ser un objeto.");
    const key = raw.key;
    const className = raw.name;
    if (typeof key !== "string" || key.trim() === "") return fail("'key' es obligatorio y debe ser texto.");
    if (typeof className !== "string" || className.trim() === "") return fail("'name' es obligatorio y debe ser texto.");
    const value: AddClassArgs = {
      key,
      name: className,
      ...(typeof raw.loc === "string" && raw.loc.trim() !== "" ? { loc: raw.loc.trim() } : {}),
      ...(typeof raw.category === "string" && ["Class", "Interface", "Enum"].includes(raw.category)
        ? { category: raw.category as AddClassArgs["category"] }
        : {}),
      ...(typeof raw.isAbstract === "boolean" ? { isAbstract: raw.isAbstract } : {}),
      ...(Array.isArray(raw.literals)
        ? { literals: (raw.literals as unknown[]).filter((x) => typeof x === "string") as string[] }
        : {}),
      ...(Array.isArray(raw.attributes)
        ? { attributes: raw.attributes as unknown as AddClassArgs["attributes"] }
        : {}),
      ...(Array.isArray(raw.methods)
        ? { methods: raw.methods as unknown as AddClassArgs["methods"] }
        : {}),
    };
    return { ok: true, value };
  },

  execute(args: AddClassArgs) {
    const diagram = requireDiagram();
    const model = diagram.model as go.GraphLinksModel;
    const normKey = normalizeKey(args.key);
    if (model.nodeDataArray.some((n) => normalizeKey((n as { key?: unknown }).key as string | number) === normKey)) {
      return { ok: false, error: "La clave ya existe." };
    }
    const category = (args.category as "Class" | "Interface" | "Enum") ?? "Class";
    const loc = isValidLoc(args.loc) ? args.loc!.trim() : nextGridLoc(diagram, model.nodeDataArray.length);
    let node: Record<string, unknown>;
    if (category === "Enum") {
      node = {
        key: normKey,
        name: args.name,
        category: "Enum" as const,
        literals: (args.literals ?? []).filter((x): x is string => typeof x === "string"),
        loc,
      };
    } else if (category === "Interface") {
      node = {
        key: normKey,
        name: args.name,
        category: "Interface" as const,
        isAbstract: false,
        methods: (args.methods ?? []).map(toMethodData),
        loc,
      };
    } else {
      node = {
        key: normKey,
        name: args.name,
        category: "Class" as const,
        isAbstract: !!args.isAbstract,
        attributes: (args.attributes ?? []).map(toAttributeData),
        methods: (args.methods ?? []).map(toMethodData),
        loc,
      };
    }
    diagram.startTransaction("tool-addClass");
    model.addNodeData(node);
    diagram.commitTransaction("tool-addClass");
    const added = model.nodeDataArray.find((n) => (n as { key?: unknown }).key === args.key);
    if (added) {
      const part = diagram.findNodeForData(added);
      if (part) diagram.select(part);
    }
    return { ok: true, message: `Clase "${args.name}" creada.`, data: { key: args.key } };
  },
} satisfies ToolDef<AddClassArgs, "addClass">;
