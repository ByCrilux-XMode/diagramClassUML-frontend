import * as go from "gojs";
import type { Multiplicity, RelationshipLinkData } from "@/types/uml";
import { analyze } from "@/lib/rules";
import type { ValidationResult } from "../define";
import { fail, isObject } from "../define";
import type { ToolDef } from "../define";
import { modelToUmlModel } from "../serializer";
import { RELATION_ENUM, findNodeData, normalizeRelationKind, requireDiagram } from "../helpers";

export interface ConnectArgs {
  from: string | number;
  to: string | number;
  kind: string;
  fromMult?: string;
  toMult?: string;
  label?: string;
}

export const connectTool = {
  name: "connect",
  description:
    "Crea una relación UML entre dos nodos existentes. En agregación/composición el extremo 'from' es el contenedor (donde va el rombo). En generalización/realización/dependencia el destino ('to') recibe la punta de la flecha.",
  visual: true,
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

  validate(raw: unknown): ValidationResult<ConnectArgs> {
    if (!isObject(raw)) return fail("Los argumentos deben ser un objeto.");
    const from = raw.from;
    const to = raw.to;
    const kind = raw.kind;
    if (typeof from !== "string" && typeof from !== "number") return fail("'from' es obligatorio (identificador).");
    if (typeof to !== "string" && typeof to !== "number") return fail("'to' es obligatorio (identificador).");
    if (typeof kind !== "string" || kind.trim() === "") return fail("'kind' es obligatorio y debe ser texto.");
    const value: ConnectArgs = {
      from,
      to,
      kind,
      ...(typeof raw.fromMult === "string" ? { fromMult: raw.fromMult } : {}),
      ...(typeof raw.toMult === "string" ? { toMult: raw.toMult } : {}),
      ...(typeof raw.label === "string" ? { label: raw.label } : {}),
    };
    return { ok: true, value };
  },

  execute(args: ConnectArgs) {
    const diagram = requireDiagram();
    const model = diagram.model as go.GraphLinksModel;
    const kind = normalizeRelationKind(args.kind);
    if (!kind) return { ok: false, error: `Tipo de relación inválido: '${args.kind}'.` };
    const fromNode = findNodeData(diagram, args.from);
    if (!fromNode) {
      return { ok: false, error: `El extremo de origen '${args.from}' no existe.` };
    }
    const toNode = findNodeData(diagram, args.to);
    if (!toNode) {
      return { ok: false, error: `El extremo de destino '${args.to}' no existe.` };
    }
    const link: RelationshipLinkData = {
      key: crypto.randomUUID(),
      category: kind,
      from: String((fromNode as { key: unknown }).key),
      to: String((toNode as { key: unknown }).key),
      fromMultiplicity: args.fromMult as Multiplicity | undefined,
      toMultiplicity: args.toMult as Multiplicity | undefined,
    };
    if (args.label !== undefined) link.name = args.label;
    diagram.startTransaction("tool-connect");
    model.addLinkData(link);
    diagram.commitTransaction("tool-connect");
    const result = analyze(modelToUmlModel(diagram));
    return {
      ok: true,
      message: `Relación ${kind} creada.`,
      data: {
        key: link.key,
        fkSuggestion: result.fkPlacements.find((p) => p.linkKey === link.key) ?? null,
        issues: result.issues.filter((i) => i.linkKey === link.key),
      },
    };
  },
} satisfies ToolDef<ConnectArgs, "connect">;
