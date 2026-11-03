/**
 * Serializador compacto del diagrama.
 *
 * Lo comparten dos consumidores:
 *  - el snapshot que se inyecta en el system prompt al inicio de cada turno,
 *  - la tool `getState`, que devuelve el mismo estado a demanda.
 *
 * No incluye layout (loc/size/points) ni datos internos de GoJS: solo la
 * semántica UML que el modelo necesita para decidir.
 */
import * as go from "gojs";
import type { NodeCategory, UMLRelationType, UmlNodeData } from "@/types/uml";
import { formatAttribute, formatMethod } from "@/lib/go/converters";
import { getDiagram } from "./graphStore";
import { modelToUmlModel } from "./serializer";

/** Por encima de este número de clases el snapshot omite miembros para no inflar el prompt. */
export const SNAPSHOT_MAX_CLASSES = 25;

export interface DiagramClassState {
  key: string;
  name: string;
  category: NodeCategory;
  isAbstract?: boolean;
  attributes?: string[];
  methods?: string[];
  literals?: string[];
}

export interface DiagramLinkState {
  key: string;
  from: string | number;
  to: string | number;
  kind: UMLRelationType;
  fromMult?: string;
  toMult?: string;
  label?: string;
}

export interface DiagramState {
  classes: DiagramClassState[];
  links: DiagramLinkState[];
}

export interface SerializeStateOptions {
  includeMembers?: boolean;
}

function toClassState(node: UmlNodeData, includeMembers: boolean): DiagramClassState {
  const state: DiagramClassState = {
    key: node.key,
    name: node.name,
    category: node.category,
  };
  if (node.category === "Class" && node.isAbstract) state.isAbstract = true;
  if (!includeMembers) return state;

  if (node.category === "Class") {
    if (node.attributes.length > 0) state.attributes = node.attributes.map(formatAttribute);
    if (node.methods.length > 0) state.methods = node.methods.map(formatMethod);
  } else if (node.category === "Interface") {
    if (node.methods.length > 0) state.methods = node.methods.map(formatMethod);
  } else {
    if (node.literals.length > 0) state.literals = node.literals.slice();
  }
  return state;
}

export function serializeDiagramState(
  diagram: go.Diagram,
  options: SerializeStateOptions = {}
): DiagramState {
  const includeMembers = options.includeMembers ?? true;
  const { nodes, links } = modelToUmlModel(diagram);

  return {
    classes: nodes.map((node) => toClassState(node, includeMembers)),
    links: links.map((link) => {
      const state: DiagramLinkState = {
        key: link.key,
        from: link.from,
        to: link.to,
        kind: link.category,
      };
      if (link.fromMultiplicity) state.fromMult = link.fromMultiplicity;
      if (link.toMultiplicity) state.toMult = link.toMultiplicity;
      if (link.name) state.label = link.name;
      return state;
    }),
  };
}

/** Estado para el system prompt: omite miembros si el diagrama es grande. */
export function readDiagramSnapshot(): DiagramState | undefined {
  const diagram = getDiagram();
  if (!diagram) return undefined;
  const nodeCount = (diagram.model as go.GraphLinksModel).nodeDataArray.length;
  return serializeDiagramState(diagram, { includeMembers: nodeCount <= SNAPSHOT_MAX_CLASSES });
}
