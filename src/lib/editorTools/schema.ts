import type { AttributeData, MethodData } from "@/types/uml";
import type { ToolArgs, ToolName } from "./toolTypes";

export interface ToolSchemaEntry {
  name: ToolName;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}

const VISIBILITY_ENUM = ["+", "-", "#", "~"];
const DIRECTION_ENUM = ["in", "out", "inout"];
const RELATION_ENUM = [
  "association",
  "aggregation",
  "composition",
  "generalization",
  "dependency",
  "realization",
];

type AddAttr = { name: string; type?: string; visibility?: "+" | "-" | "#" | "~" };
type AddMethod = {
  name: string;
  visibility?: "+" | "-" | "#" | "~";
  parameters?: Array<{ name: string; type: string; direction?: "in" | "out" | "inout" }>;
  returnType?: string;
};

export const TOOL_SCHEMAS: ToolSchemaEntry[] = [
  {
    name: "addClass",
    description:
      "Crea una clase UML. Puedes indicar 'loc' como 'x y' para posicionarla; si no la das, se auto-posiciona en grilla. La IA debe elegir ubicaciones distribuidas (ej. grilla 3 cols, gap 320x190 alrededor de 0,0) para evitar que todas queden apiladas. Si la clave ya existe, falla.",
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
  },
  {
    name: "removeClass",
    description:
      "Elimina una clase (y sus relaciones conectadas) del diagrama buscándola por su clave.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Clave de la clase a eliminar." },
      },
      required: ["key"],
    },
  },
  {
    name: "rename",
    description: "Cambia el nombre visible de una clase existente sin tocar su clave.",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "Clave de la clase a renombrar." },
        newName: { type: "string", description: "Nuevo nombre visible." },
      },
      required: ["key", "newName"],
    },
  },
  {
    name: "connect",
    description:
      "Crea una relación UML entre dos nodos existentes. En agregación/composición el extremo 'from' es el contenedor (donde va el rombo). En generalización/realización/dependencia el destino ('to') recibe la punta de la flecha.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "Clave del nodo de origen de la relación." },
        to: { type: "string", description: "Clave del nodo de destino de la relación." },
        kind: {
          type: "string",
          enum: [...RELATION_ENUM, "inheritance"],
          description: "Tipo de relación UML ('inheritance' es sinónimo de 'generalization').",
        },
        fromMult: { type: "string", description: "Multiplicidad en el extremo 'from': '1', '0..1', '*', '0..*', '1..*', 'M..N'." },
        toMult: { type: "string", description: "Multiplicidad en el extremo 'to', mismo formato que fromMult." },
        label: { type: "string", description: "Nombre/etiqueta opcional de la relación." },
      },
      required: ["from", "to", "kind"],
    },
  },
  {
    name: "disconnect",
    description: "Elimina una relación existente del diagrama buscándola por su clave de enlace.",
    parameters: {
      type: "object",
      properties: {
        linkKey: { type: "string", description: "Clave del enlace (relación) a eliminar." },
      },
      required: ["linkKey"],
    },
  },
  {
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
  },
  {
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
  },
  {
    name: "replaceAll",
    description:
      "Reemplaza el modelo completo del diagrama por un JSON. Acepta {nodes, links} con datos UML o un JSON exportado de GoJS con 'class': 'GraphLinksModel'. Falla si un enlace referencia un nodo inexistente.",
    parameters: {
      type: "object",
      properties: {
        modelJson: { type: "string", description: "JSON serializado del modelo." },
      },
      required: ["modelJson"],
    },
  },
  {
    name: "validate",
    description:
      "Valida el diagrama actual: devuelve observaciones (issues) y sugerencias de claves foráneas (fkPlacements) según las reglas de multiplicidad.",
    parameters: { type: "object", properties: {} },
  },
];

export function buildOllamaToolDefs(): Array<{ type: "function"; function: ToolSchemaEntry }> {
  return TOOL_SCHEMAS.map((fn) => ({ type: "function", function: fn }));
}

type ValidationResult = { ok: true; value: ToolArgs } | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateArgs(name: ToolName, args: unknown): ValidationResult {
  if (!isObject(args)) return fail("Los argumentos deben ser un objeto.");

  switch (name) {
    case "addClass": {
      const key = args.key;
      const className = args.name;
      if (typeof key !== "string" || key.trim() === "") return fail("'key' es obligatorio y debe ser texto.");
      if (typeof className !== "string" || className.trim() === "") return fail("'name' es obligatorio y debe ser texto.");
      const value: ToolArgs = {
        key,
        name: className,
        ...(typeof args.loc === "string" && args.loc.trim() !== "" ? { loc: args.loc.trim() } : {}),
        ...(typeof args.category === "string" && ["Class", "Interface", "Enum"].includes(args.category) ? { category: args.category as "Class" | "Interface" | "Enum" } : {}),
        ...(typeof args.isAbstract === "boolean" ? { isAbstract: args.isAbstract } : {}),
        ...(Array.isArray(args.literals) ? { literals: (args.literals as unknown[]).filter((x) => typeof x === "string") as string[] } : {}),
        ...(Array.isArray(args.attributes) ? { attributes: args.attributes as unknown as AddAttr[] } : {}),
        ...(Array.isArray(args.methods) ? { methods: args.methods as unknown as AddMethod[] } : {}),
      };
      return { ok: true, value };
    }
    case "removeClass": {
      const key = args.key;
      if (typeof key !== "string" || key.trim() === "") return fail("'key' es obligatorio y debe ser texto.");
      return { ok: true, value: { key } };
    }
    case "rename": {
      const key = args.key;
      const newName = args.newName;
      if (typeof key !== "string" || key.trim() === "") return fail("'key' es obligatorio y debe ser texto.");
      if (typeof newName !== "string" || newName.trim() === "") return fail("'newName' es obligatorio y debe ser texto.");
      return { ok: true, value: { key, newName } };
    }
    case "connect": {
      const from = args.from;
      const to = args.to;
      const kind = args.kind;
      if (typeof from !== "string" && typeof from !== "number") return fail("'from' es obligatorio (identificador).");
      if (typeof to !== "string" && typeof to !== "number") return fail("'to' es obligatorio (identificador).");
      if (typeof kind !== "string" || kind.trim() === "") return fail("'kind' es obligatorio y debe ser texto.");
      const value: ToolArgs = {
        from,
        to,
        kind,
        ...(typeof args.fromMult === "string" ? { fromMult: args.fromMult } : {}),
        ...(typeof args.toMult === "string" ? { toMult: args.toMult } : {}),
        ...(typeof args.label === "string" ? { label: args.label } : {}),
      };
      return { ok: true, value };
    }
    case "disconnect": {
      const linkKey = args.linkKey;
      if (typeof linkKey !== "string" || linkKey.trim() === "") return fail("'linkKey' es obligatorio y debe ser texto.");
      return { ok: true, value: { linkKey } };
    }
    case "updateAttribute": {
      const classKey = args.classKey;
      const action = args.action;
      if (typeof classKey !== "string" || classKey.trim() === "") return fail("'classKey' es obligatorio y debe ser texto.");
      if (action !== "add" && action !== "remove" && action !== "update") {
        return fail("'action' debe ser 'add', 'remove' o 'update'.");
      }
      if (
        (action === "add" || action === "update") &&
        (!isObject(args.attribute) || typeof args.attribute.name !== "string" || args.attribute.name.trim() === "")
      ) {
        return fail("'attribute' (objeto con 'name') es obligatorio para 'add' y 'update'.");
      }
      const value: ToolArgs = {
        classKey,
        action,
        ...(isObject(args.attribute) ? { attribute: args.attribute as unknown as Partial<AttributeData> } : {}),
        ...(typeof args.index === "number" ? { index: args.index } : {}),
      };
      return { ok: true, value };
    }
    case "updateMethod": {
      const classKey = args.classKey;
      const action = args.action;
      if (typeof classKey !== "string" || classKey.trim() === "") return fail("'classKey' es obligatorio y debe ser texto.");
      if (action !== "add" && action !== "remove" && action !== "update") {
        return fail("'action' debe ser 'add', 'remove' o 'update'.");
      }
      if (
        (action === "add" || action === "update") &&
        (!isObject(args.method) || typeof args.method.name !== "string" || args.method.name.trim() === "")
      ) {
        return fail("'method' (objeto con 'name') es obligatorio para 'add' y 'update'.");
      }
      const value: ToolArgs = {
        classKey,
        action,
        ...(isObject(args.method) ? { method: args.method as unknown as Partial<MethodData> & { name: string } } : {}),
        ...(typeof args.index === "number" ? { index: args.index } : {}),
      };
      return { ok: true, value };
    }
    case "replaceAll": {
      const modelJson = args.modelJson;
      if (typeof modelJson !== "string" || modelJson.trim() === "") return fail("'modelJson' es obligatorio y debe ser texto.");
      return { ok: true, value: { modelJson } };
    }
    case "validate":
      return { ok: true, value: {} as ToolArgs };
  }
}