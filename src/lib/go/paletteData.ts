import type { UMLRelationType } from "@/types/uml";

export interface RelationshipPaletteItem {
  key: string;
  category: UMLRelationType;
  name: string;
}

export const RELATIONSHIP_PALETTE_ITEMS: RelationshipPaletteItem[] = [
  { key: "rel-association", category: "association", name: "Asociación" },
  { key: "rel-aggregation", category: "aggregation", name: "Agregación" },
  { key: "rel-composition", category: "composition", name: "Composición" },
  { key: "rel-generalization", category: "generalization", name: "Generalización" },
  { key: "rel-dependency", category: "dependency", name: "Dependencia" },
  { key: "rel-realization", category: "realization", name: "Realización" },
];