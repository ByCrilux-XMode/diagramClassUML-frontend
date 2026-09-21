import type {
  Multiplicity,
  RelationshipLinkData,
  UmlModelData,
  UmlNodeData,
  UMLRelationType,
} from "@/types/uml";

export type RuleSeverity = "error" | "warning" | "info";

export interface RuleIssue {
  severity: RuleSeverity;
  code: string;
  message: string;
  nodeKey?: string;
  linkKey?: string;
  suggestion?: string;
}

export type FkKind = "one_to_many" | "one_to_one" | "many_to_many";

export interface FkPlacement {
  linkKey: string;
  fkOwnerKey: string; // entidad que recibe la FK
  fkTargetKey: string; // entidad referenciada
  kind: FkKind;
  columnName: string; // sugerencia: `${targetName.toLowerCase()}Id`
}

export interface RulesResult {
  issues: RuleIssue[];
  fkPlacements: FkPlacement[];
}

export interface RulesConfig {
  oneToOneStrict: "warn" | "assign_from"; // default "warn"
}
export const DEFAULT_RULES_CONFIG: RulesConfig = { oneToOneStrict: "warn" };

export interface MultiplicityBounds {
  min: number;
  max: number;
}

export type MultiplicityClass = "one" | "optional" | "many";

const RELATION_LABEL: Record<UMLRelationType, string> = {
  association: "Asociación",
  aggregation: "Agregación",
  composition: "Composición",
  generalization: "Generalización",
  dependency: "Dependencia",
  realization: "Realización",
};

const FK_CATEGORIES: ReadonlySet<UMLRelationType> = new Set<UMLRelationType>([
  "association",
  "aggregation",
  "composition",
]);

export function parseMultiplicity(mult?: Multiplicity): MultiplicityBounds {
  if (mult === undefined) return { min: 1, max: 1 };
  switch (mult) {
    case "1":
      return { min: 1, max: 1 };
    case "0..1":
      return { min: 0, max: 1 };
    case "*":
    case "0..*":
      return { min: 0, max: Infinity };
    case "1..*":
      return { min: 1, max: Infinity };
  }
  const parts = mult.split("..");
  if (parts.length === 2) {
    const min = Number(parts[0]);
    const max = parts[1] === "*" ? Infinity : Number(parts[1]);
    if (Number.isFinite(min) && (parts[1] === "*" || Number.isFinite(max))) {
      return { min, max };
    }
  }
  return { min: 1, max: 1 };
}

export function classifyMultiplicity(bounds: MultiplicityBounds): MultiplicityClass {
  if (bounds.max === 1 && bounds.min >= 1) return "one";
  if (bounds.max === 1 && bounds.min === 0) return "optional";
  return "many";
}

function nodeMapOf(model: UmlModelData): Map<string | number, UmlNodeData> {
  const map = new Map<string | number, UmlNodeData>();
  for (const node of model.nodes) map.set(node.key, node);
  return map;
}

function makePlacement(
  link: RelationshipLinkData,
  fkOwnerKey: string | number,
  fkTargetKey: string | number,
  kind: FkKind,
  nodes: Map<string | number, UmlNodeData>
): FkPlacement {
  const target = nodes.get(fkTargetKey);
  const targetName = target?.name ?? String(fkTargetKey);
  return {
    linkKey: link.key,
    fkOwnerKey: String(fkOwnerKey),
    fkTargetKey: String(fkTargetKey),
    kind,
    columnName: `${targetName.toLowerCase()}Id`,
  };
}

function fkPlacementForLink(
  link: RelationshipLinkData,
  nodes: Map<string | number, UmlNodeData>,
  config?: RulesConfig
): FkPlacement | null {
  const fromBounds = parseMultiplicity(link.fromMultiplicity);
  const toBounds = parseMultiplicity(link.toMultiplicity);
  const fromClass = classifyMultiplicity(fromBounds);
  const toClass = classifyMultiplicity(toBounds);

  if (fromClass === "many" && toClass !== "many") {
    return makePlacement(link, link.from, link.to, "one_to_many", nodes);
  }
  if (toClass === "many" && fromClass !== "many") {
    return makePlacement(link, link.to, link.from, "one_to_many", nodes);
  }
  if (fromClass === "many" && toClass === "many") return null;

  if (fromClass === "optional" && toClass === "one") {
    return makePlacement(link, link.from, link.to, "one_to_one", nodes);
  }
  if (fromClass === "one" && toClass === "optional") {
    return makePlacement(link, link.to, link.from, "one_to_one", nodes);
  }
  if (fromClass === "one" && toClass === "one") {
    if (config?.oneToOneStrict === "assign_from") {
      return makePlacement(link, link.from, link.to, "one_to_one", nodes);
    }
    return null;
  }
  return makePlacement(link, link.from, link.to, "one_to_one", nodes);
}

export function analyzeFk(model: UmlModelData, config?: RulesConfig): FkPlacement[] {
  const nodes = nodeMapOf(model);
  const placements: FkPlacement[] = [];
  for (const link of model.links) {
    if (!FK_CATEGORIES.has(link.category)) continue;
    if (!nodes.has(link.from) || !nodes.has(link.to)) continue;
    const placement = fkPlacementForLink(link, nodes, config);
    if (placement) placements.push(placement);
  }
  return placements;
}

export function validate(model: UmlModelData, config?: RulesConfig): RuleIssue[] {
  const cfg: RulesConfig = { ...DEFAULT_RULES_CONFIG, ...config };
  const nodes = nodeMapOf(model);
  const issues: RuleIssue[] = [];

  for (const link of model.links) {
    const fromNode = nodes.get(link.from);
    const toNode = nodes.get(link.to);
    if (!fromNode || !toNode) {
      issues.push({
        severity: "error",
        code: "NODE.MISSING",
        message: "El extremo referencia un nodo inexistente.",
        linkKey: link.key,
      });
      continue;
    }

    const fromBounds = parseMultiplicity(link.fromMultiplicity);
    const toBounds = parseMultiplicity(link.toMultiplicity);
    const fromClass = classifyMultiplicity(fromBounds);
    const toClass = classifyMultiplicity(toBounds);

    if (link.category === "composition" && fromBounds.max > 1) {
      issues.push({
        severity: "warning",
        code: "COMP.CONSISTENCY",
        message: "El extremo contenedor de una composición debería tener multiplicidad 1.",
        linkKey: link.key,
        suggestion: "Usar multiplicidad 1 en el extremo contenedor.",
      });
    }

    if (
      link.category === "generalization" ||
      link.category === "realization" ||
      link.category === "dependency"
    ) {
      issues.push({
        severity: "info",
        code: "REL.NO_FK",
        message: `${RELATION_LABEL[link.category]}: esta relación no genera clave foránea.`,
        linkKey: link.key,
      });
    } else {
      if (fromClass === "one" && toClass === "one" && cfg.oneToOneStrict === "warn") {
        issues.push({
          severity: "warning",
          code: "FK.1TO1.STRICT",
          message: "Relación 1:1 estricta: elegir manualmente en qué extremo colocar la FK.",
          linkKey: link.key,
          suggestion: "Elegir un extremo y colocar la FK con restricción única en él.",
        });
      } else if (fromClass === "many" && toClass === "many") {
        issues.push({
          severity: "info",
          code: "FK.M2M",
          message: "N:N: se necesita una tabla puente.",
          linkKey: link.key,
          suggestion: "Crear una entidad intermedia con dos claves foráneas hacia ambos extremos.",
        });
      }
    }

    if (link.category === "realization" && toNode.category !== "Interface") {
      issues.push({
        severity: "warning",
        code: "REL.CATEGORY",
        message: "La realización debe apuntar a una interfaz.",
        linkKey: link.key,
        nodeKey: String(link.to),
        suggestion: "El extremo destino debe ser un clasificador de tipo Interface.",
      });
    }
    if (link.category === "generalization" && (fromNode.category !== "Class" || toNode.category !== "Class")) {
      issues.push({
        severity: "warning",
        code: "REL.CATEGORY",
        message: "La generalización solo aplica entre clases.",
        linkKey: link.key,
        suggestion: "Ambos extremos deben ser clasificadores de tipo Class.",
      });
    }
    if (
      (link.category === "composition" ||
        link.category === "aggregation" ||
        link.category === "association") &&
      (fromNode.category === "Interface" || fromNode.category === "Enum")
    ) {
      issues.push({
        severity: "warning",
        code: "REL.CATEGORY",
        message: "El extremo contenedor de una relación no puede ser una interfaz o enumeración.",
        linkKey: link.key,
        nodeKey: String(link.from),
        suggestion: "Usar una clase concreta como contenedor de la relación.",
      });
    }
  }

  return issues;
}

export function analyze(model: UmlModelData, config?: RulesConfig): RulesResult {
  return {
    issues: validate(model, config),
    fkPlacements: analyzeFk(model, config),
  };
}