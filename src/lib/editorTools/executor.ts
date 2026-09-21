import * as go from "gojs";
import type {
  AttributeData,
  ClassNodeData,
  MethodData,
  Multiplicity,
  ParameterDirection,
  RelationshipLinkData,
  UMLRelationType,
  Visibility,
} from "@/types/uml";
import { analyze } from "@/lib/rules";
import { modelToUmlModel, jsonToModel } from "@/lib/editorTools/serializer";
import { getDiagram } from "@/lib/editorTools/graphStore";
import { createLinkTemplateMap, createNodeTemplateMap } from "@/lib/go/registry";
import type { ToolArgs, ToolName, ToolResult } from "./toolTypes";

interface AddClassArgs {
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

function isValidLoc(loc: string | undefined): boolean {
  if (!loc || typeof loc !== "string") return false;
  const parts = loc.trim().split(/\s+/);
  if (parts.length !== 2) return false;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  return isFinite(x) && isFinite(y);
}

interface ConnectArgs {
  from: string | number;
  to: string | number;
  kind: string;
  fromMult?: string;
  toMult?: string;
  label?: string;
}

interface UpdateAttributeArgs {
  classKey: string;
  action: "add" | "remove" | "update";
  attribute?: Partial<AttributeData>;
  index?: number;
}

interface UpdateMethodArgs {
  classKey: string;
  action: "add" | "remove" | "update";
  method?: Partial<MethodData> & { name: string };
  index?: number;
}

const VALID_VISIBILITIES: ReadonlySet<string> = new Set(["+", "-", "#", "~"]);
const VALID_DIRECTIONS: ReadonlySet<string> = new Set(["in", "out", "inout"]);
const RELATION_VALUES: ReadonlySet<string> = new Set([
  "association",
  "aggregation",
  "composition",
  "generalization",
  "dependency",
  "realization",
]);
const RELATION_ALIASES: Record<string, UMLRelationType> = {
  inheritance: "generalization",
};

function toAttributeData(a: { name: string; type?: string; visibility?: Visibility }): AttributeData {
  const visibility: Visibility =
    a.visibility !== undefined && VALID_VISIBILITIES.has(a.visibility)
      ? a.visibility
      : "+";
  return { name: a.name, type: a.type ?? "", visibility };
}

function toMethodData(m: {
  name: string;
  visibility?: Visibility;
  parameters?: Array<{ name: string; type: string; direction?: ParameterDirection }>;
  returnType?: string;
}): MethodData {
  const method: MethodData = {
    name: m.name,
    visibility:
      m.visibility !== undefined && VALID_VISIBILITIES.has(m.visibility) ? m.visibility : "+",
    parameters: (m.parameters ?? []).map((p) => {
      const direction: ParameterDirection =
        p.direction !== undefined && VALID_DIRECTIONS.has(p.direction) ? p.direction : "in";
      return { direction, name: p.name, type: p.type };
    }),
  };
  if (m.returnType !== undefined) method.returnType = m.returnType;
  return method;
}

function normalizeRelationKind(raw: string): UMLRelationType | null {
  const value = raw.trim().toLowerCase();
  const aliased = RELATION_ALIASES[value];
  if (aliased) return aliased;
  if (RELATION_VALUES.has(value)) return value as UMLRelationType;
  return null;
}

function buildAttributeData(attr: Partial<AttributeData>): AttributeData {
  const result: AttributeData = {
    name: attr.name ?? "",
    type: attr.type ?? "",
    visibility: attr.visibility ?? "+",
  };
  if (attr.multiplicity !== undefined) result.multiplicity = attr.multiplicity;
  if (attr.defaultValue !== undefined) result.defaultValue = attr.defaultValue;
  if (attr.isStatic !== undefined) result.isStatic = attr.isStatic;
  if (attr.isDerived !== undefined) result.isDerived = attr.isDerived;
  if (attr.isReadOnly !== undefined) result.isReadOnly = attr.isReadOnly;
  return result;
}

function normalizeKey(k: string | number | undefined): string {
  if (k === undefined || k === null) return "";
  return String(k).trim().toLowerCase();
}

function findNodeData(diagram: go.Diagram, key: string | number): Record<string, unknown> | null {
  const norm = normalizeKey(key);
  const model = diagram.model as go.GraphLinksModel;
  return (
    (model.nodeDataArray.find(
      (n) => normalizeKey((n as { key?: string | number }).key) === norm
    ) as Record<string, unknown> | undefined) ?? null
  );
}

function findLinkData(diagram: go.Diagram, linkKey: string | number): Record<string, unknown> | null {
  const model = diagram.model as go.GraphLinksModel;
  return (
    (model.linkDataArray.find(
      (l) => (l as { key?: string | number }).key === linkKey
    ) as Record<string, unknown> | undefined) ?? null
  );
}

function nextGridLoc(diagram: go.Diagram, index: number): string {
  const vb = diagram.viewportBounds;
  const hasViewport = vb && isFinite(vb.x) && isFinite(vb.y) && vb.width > 10 && vb.height > 10;
  const center = hasViewport ? vb.center : new go.Point(0, 0);
  // Fallback si center es NaN (diagrama aún sin layout)
  const cx = isFinite(center.x) ? center.x : 0;
  const cy = isFinite(center.y) ? center.y : 0;
  const cols = 3;
  const gapX = 320;
  const gapY = 190;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const originX = cx - ((cols - 1) * gapX) / 2;
  const originY = cy - 80;
  const x = originX + col * gapX;
  const y = originY + row * gapY;
  return `${x} ${y}`;
}

function toolAddClass(diagram: go.Diagram, args: AddClassArgs): ToolResult {
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
}

function toolRemoveClass(diagram: go.Diagram, args: { key: string }): ToolResult {
  const model = diagram.model as go.GraphLinksModel;
  const node = findNodeData(diagram, args.key);
  if (!node) return { ok: false, error: `No se encontró la clase con clave '${args.key}'.` };
  diagram.startTransaction("tool-removeClass");
  model.removeNodeData(node);
  diagram.commitTransaction("tool-removeClass");
  return { ok: true, message: "Clase eliminada.", data: { removedKey: args.key } };
}

function toolRename(diagram: go.Diagram, args: { key: string; newName: string }): ToolResult {
  const model = diagram.model as go.GraphLinksModel;
  const node = findNodeData(diagram, args.key);
  if (!node) return { ok: false, error: `No se encontró la clase con clave '${args.key}'.` };
  diagram.startTransaction("tool-rename");
  model.setDataProperty(node, "name", args.newName);
  diagram.commitTransaction("tool-rename");
  return { ok: true, message: "Clase renombrada.", data: { key: args.key, name: args.newName } };
}

function toolConnect(diagram: go.Diagram, args: ConnectArgs): ToolResult {
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
}

function toolDisconnect(diagram: go.Diagram, args: { linkKey: string }): ToolResult {
  const model = diagram.model as go.GraphLinksModel;
  const link = findLinkData(diagram, args.linkKey);
  if (!link) return { ok: false, error: `No se encontró el enlace con clave '${args.linkKey}'.` };
  diagram.startTransaction("tool-disconnect");
  model.removeLinkData(link);
  diagram.commitTransaction("tool-disconnect");
  return { ok: true, message: "Relación eliminada.", data: { removedKey: args.linkKey } };
}

function toolUpdateAttribute(diagram: go.Diagram, args: UpdateAttributeArgs): ToolResult {
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
}

function toolUpdateMethod(diagram: go.Diagram, args: UpdateMethodArgs): ToolResult {
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
}

function toolReplaceAll(diagram: go.Diagram, args: { modelJson: string }): ToolResult {
  const model = jsonToModel(args.modelJson);
  diagram.model = model;
  diagram.nodeTemplateMap = createNodeTemplateMap();
  diagram.linkTemplateMap = createLinkTemplateMap();
  return {
    ok: true,
    message: "Diagrama reemplazado.",
    data: { nodes: model.nodeDataArray.length, links: model.linkDataArray.length },
  };
}

function toolValidate(diagram: go.Diagram): ToolResult {
  const result = analyze(modelToUmlModel(diagram));
  return {
    ok: true,
    message: result.issues.length
      ? `Validación completada con ${result.issues.length} observaciones.`
      : "Validación completada sin observaciones.",
    data: { issues: result.issues, fkPlacements: result.fkPlacements },
  };
}

export function executeTool(name: ToolName, args: ToolArgs): ToolResult {
  const diagram = getDiagram();
  if (!diagram) return { ok: false, error: "Sin diagrama activo." };
  try {
    switch (name) {
      case "addClass":
        return toolAddClass(diagram, args as AddClassArgs);
      case "removeClass":
        return toolRemoveClass(diagram, args as { key: string });
      case "rename":
        return toolRename(diagram, args as { key: string; newName: string });
      case "connect":
        return toolConnect(diagram, args as ConnectArgs);
      case "disconnect":
        return toolDisconnect(diagram, args as { linkKey: string });
      case "updateAttribute":
        return toolUpdateAttribute(diagram, args as UpdateAttributeArgs);
      case "updateMethod":
        return toolUpdateMethod(diagram, args as UpdateMethodArgs);
      case "replaceAll":
        return toolReplaceAll(diagram, args as { modelJson: string });
      case "validate":
        return toolValidate(diagram);
    }
  } catch (err) {
    if (diagram.undoManager?.currentTransaction) {
      try {
        diagram.rollbackTransaction();
      } catch {
        // el diagrama pudo quedar en un estado intermedio; se ignora
      }
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: false, error: `Tool desconocido: '${name}'.` };
}