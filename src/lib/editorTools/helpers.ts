/**
 * Utilidades compartidas por las tools: acceso al diagrama activo,
 * normalización de claves, conversión de atributos/métodos y layout base.
 */
import * as go from "gojs";
import type {
  AttributeData,
  MethodData,
  ParameterDirection,
  UMLRelationType,
  Visibility,
} from "@/types/uml";
import { getDiagram } from "./graphStore";

export const VISIBILITY_ENUM = ["+", "-", "#", "~"];
export const DIRECTION_ENUM = ["in", "out", "inout"];
export const RELATION_ENUM = [
  "association",
  "aggregation",
  "composition",
  "generalization",
  "dependency",
  "realization",
];

export const VALID_VISIBILITIES: ReadonlySet<string> = new Set(VISIBILITY_ENUM);
export const VALID_DIRECTIONS: ReadonlySet<string> = new Set(DIRECTION_ENUM);

const RELATION_VALUES: ReadonlySet<string> = new Set(RELATION_ENUM);
const RELATION_ALIASES: Record<string, UMLRelationType> = {
  inheritance: "generalization",
};

export function requireDiagram(): go.Diagram {
  const diagram = getDiagram();
  if (!diagram) throw new Error("Sin diagrama activo.");
  return diagram;
}

export function normalizeKey(k: string | number | undefined): string {
  if (k === undefined || k === null) return "";
  return String(k).trim().toLowerCase();
}

export function findNodeData(
  diagram: go.Diagram,
  key: string | number
): Record<string, unknown> | null {
  const norm = normalizeKey(key);
  const model = diagram.model as go.GraphLinksModel;
  return (
    (model.nodeDataArray.find(
      (n) => normalizeKey((n as { key?: string | number }).key) === norm
    ) as Record<string, unknown> | undefined) ?? null
  );
}

export function findLinkData(
  diagram: go.Diagram,
  linkKey: string | number
): Record<string, unknown> | null {
  const model = diagram.model as go.GraphLinksModel;
  return (
    (model.linkDataArray.find(
      (l) => (l as { key?: string | number }).key === linkKey
    ) as Record<string, unknown> | undefined) ?? null
  );
}

export function isValidLoc(loc: string | undefined): boolean {
  if (!loc || typeof loc !== "string") return false;
  const parts = loc.trim().split(/\s+/);
  if (parts.length !== 2) return false;
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  return isFinite(x) && isFinite(y);
}

export function nextGridLoc(diagram: go.Diagram, index: number): string {
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

export function toAttributeData(a: {
  name: string;
  type?: string;
  visibility?: Visibility;
}): AttributeData {
  const visibility: Visibility =
    a.visibility !== undefined && VALID_VISIBILITIES.has(a.visibility) ? a.visibility : "+";
  return { name: a.name, type: a.type ?? "", visibility };
}

export function toMethodData(m: {
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

export function normalizeRelationKind(raw: string): UMLRelationType | null {
  const value = raw.trim().toLowerCase();
  const aliased = RELATION_ALIASES[value];
  if (aliased) return aliased;
  if (RELATION_VALUES.has(value)) return value as UMLRelationType;
  return null;
}

export function buildAttributeData(attr: Partial<AttributeData>): AttributeData {
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
