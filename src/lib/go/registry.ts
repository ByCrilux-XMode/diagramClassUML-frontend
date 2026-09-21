import * as go from "gojs";
import { createClassNodeTemplate } from "./templates/classNode";
import { createEnumNodeTemplate } from "./templates/enumNode";
import { createInterfaceNodeTemplate } from "./templates/interfaceNode";
import { createAggregationLink } from "./templates/links/aggregation";
import { createAssociationLink } from "./templates/links/association";
import { createCompositionLink } from "./templates/links/composition";
import { createDependencyLink } from "./templates/links/dependency";
import { createInheritanceLink } from "./templates/links/inheritance";
import { createRealizationLink } from "./templates/links/realization";
import type { NodeCategory } from "@/types/uml";
import { INK, SURFACE, SURFACE_VARIANT_TEXT, fontSans } from "./theme";

export function createNodeTemplateMap(): go.Map<string, go.Node> {
  const map = new go.Map<string, go.Node>();
  map.add("Class", createClassNodeTemplate());
  map.add("Interface", createInterfaceNodeTemplate());
  map.add("Enum", createEnumNodeTemplate());
  return map;
}

export function createLinkTemplateMap(): go.Map<string, go.Link> {
  const map = new go.Map<string, go.Link>();
  map.add("association", createAssociationLink());
  map.add("aggregation", createAggregationLink());
  map.add("composition", createCompositionLink());
  map.add("generalization", createInheritanceLink());
  map.add("dependency", createDependencyLink());
  map.add("realization", createRealizationLink());
  return map;
}

export function createPaletteNodeTemplateMap(): go.Map<string, go.Node> {
  const map = new go.Map<string, go.Node>();
  map.add("Class", createPaletteNode("Class"));
  map.add("Interface", createPaletteNode("Interface"));
  map.add("Enum", createPaletteNode("Enum"));
  return map;
}

function createPaletteNode(kind: NodeCategory): go.Node {
  const panel = new go.Panel("Vertical", { margin: 4 });
  if (kind !== "Class") {
    panel.add(
      new go.TextBlock({
        text: kind === "Interface" ? "«interface»" : "«enumeration»",
        font: fontSans("10px", "400", "italic"),
        stroke: SURFACE_VARIANT_TEXT,
        textAlign: "center",
      })
    );
  }
  panel.add(
    new go.TextBlock({
      font: fontSans("12px", "600"),
      stroke: INK,
      textAlign: "center",
    }).bind("text", "name")
  );

  return new go.Node("Auto", {
    minSize: new go.Size(124, kind === "Class" ? 32 : 40),
  })
    .add(
      new go.Shape({
        figure: "RoundedRectangle",
        parameter1: 2,
        fill: SURFACE,
        stroke: INK,
        strokeWidth: 1,
      })
    )
    .add(panel);
}