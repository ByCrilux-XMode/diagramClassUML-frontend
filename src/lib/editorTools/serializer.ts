import * as go from "gojs";
import type { RelationshipLinkData, UmlModelData, UmlNodeData } from "@/types/uml";

export function modelToUmlModel(diagram: go.Diagram): UmlModelData {
  const model = diagram.model as go.GraphLinksModel;
  return {
    nodes: model.nodeDataArray.slice() as unknown as UmlNodeData[],
    links: model.linkDataArray.slice() as unknown as RelationshipLinkData[],
  };
}

function assertLinksReferenceExistingNodes(model: go.GraphLinksModel): void {
  const nodeKeys = new Set<string | number>();
  for (const node of model.nodeDataArray) {
    nodeKeys.add((node as { key?: string | number }).key as string | number);
  }
  for (const link of model.linkDataArray) {
    const data = link as { key?: string | number; from?: string | number; to?: string | number };
    const fromOk = data.from === undefined || nodeKeys.has(data.from);
    const toOk = data.to === undefined || nodeKeys.has(data.to);
    if (!fromOk || !toOk) {
      throw new Error(`El enlace '${String(data.key)}' referencia un nodo inexistente.`);
    }
  }
}

export function jsonToModel(json: string): go.GraphLinksModel {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("El JSON no es válido.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("El JSON del modelo debe ser un objeto.");
  }

  const raw = parsed as Record<string, unknown>;

  if (raw["class"] === "GraphLinksModel") {
    let model: go.GraphLinksModel;
    try {
      model = go.Model.fromJson(raw as never) as go.GraphLinksModel;
    } catch {
      throw new Error("No se pudo interpretar el JSON como un modelo GoJS.");
    }
    model.nodeKeyProperty = "key";
    model.linkCategoryProperty = "category";
    assertLinksReferenceExistingNodes(model);
    return model;
  }

  const nodes = Array.isArray(raw["nodes"])
    ? (raw["nodes"] as unknown as UmlNodeData[])
    : [];
  const links = Array.isArray(raw["links"])
    ? (raw["links"] as unknown as RelationshipLinkData[])
    : [];
  const nodeKeys = new Set<string | number>(nodes.map((n) => n.key));
  for (const link of links) {
    if (!nodeKeys.has(link.from) || !nodeKeys.has(link.to)) {
      throw new Error(`El enlace '${link.key}' referencia un nodo inexistente.`);
    }
  }
  return new go.GraphLinksModel({
    nodeKeyProperty: "key",
    linkKeyProperty: "key",
    linkCategoryProperty: "category",
    nodeDataArray: nodes as never[],
    linkDataArray: links as never[],
  });
}