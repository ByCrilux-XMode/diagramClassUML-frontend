import type * as go from "gojs";
import type {
  AttributeData,
  MethodData,
  NodeCategory,
  RelationshipLinkData,
  UMLRelationType,
  UmlNodeData,
} from "@/types/uml";

/**
 * Vista semántica y comparable del diagrama.
 *
 * No incluye `loc`, `size` ni puntos de ruta: son presentación. Excluye también
 * los nodos y enlaces con `isGhost`, que pertenecen a la vista previa de una
 * propuesta y todavía no existen.
 */
export interface ClaseSemantica {
  key: string;
  name: string;
  category: NodeCategory;
  isAbstract?: boolean;
  literals?: string[];
  attributes?: AttributeData[];
  methods?: MethodData[];
}

export interface RelacionSemantica {
  /** Clave estable derivada de los extremos, nunca el `key` interno de GoJS. */
  key: string;
  from: string;
  to: string;
  category: UMLRelationType;
  fromMultiplicity?: string;
  toMultiplicity?: string;
  name?: string;
}

export interface EstadoSemantico {
  clases: Map<string, ClaseSemantica>;
  relaciones: Map<string, RelacionSemantica>;
}

/** La clave de una relación se deriva de sus extremos y su tipo. */
export function claveRelacion(
  from: string | number,
  category: string,
  to: string | number,
): string {
  return `${String(from)}|${category}|${String(to)}`;
}

function copiarAtributos(attributes: AttributeData[] | undefined): AttributeData[] {
  return (attributes ?? []).map((atributo) => ({ ...atributo }));
}

function copiarMetodos(methods: MethodData[] | undefined): MethodData[] {
  return (methods ?? []).map((metodo) => ({
    ...metodo,
    parameters: (metodo.parameters ?? []).map((parametro) => ({ ...parametro })),
  }));
}

export function estadoVacio(): EstadoSemantico {
  return { clases: new Map(), relaciones: new Map() };
}

/**
 * Lee el estado semántico del modelo GoJS. Es la única puerta de entrada del
 * diff: si algo no está aquí, no se registra.
 */
export function leerEstadoSemantico(diagram: go.Diagram | null | undefined): EstadoSemantico {
  const estado = estadoVacio();
  if (!diagram) return estado;

  const model = diagram.model as go.GraphLinksModel | null;
  if (!model) return estado;

  const nodos = (model.nodeDataArray ?? []) as unknown as UmlNodeData[];
  for (const nodo of nodos) {
    if (!nodo || (nodo as { isGhost?: boolean }).isGhost) continue;
    const key = String(nodo.key);
    const clase: ClaseSemantica = {
      key,
      name: String(nodo.name ?? key),
      category: nodo.category,
    };
    if (nodo.category === "Class") {
      clase.isAbstract = Boolean(nodo.isAbstract);
      clase.attributes = copiarAtributos(nodo.attributes);
      clase.methods = copiarMetodos(nodo.methods);
    } else if (nodo.category === "Interface") {
      clase.methods = copiarMetodos(nodo.methods);
    } else if (nodo.category === "Enum") {
      clase.literals = [...(nodo.literals ?? [])];
    }
    estado.clases.set(key, clase);
  }

  const enlaces = (model.linkDataArray ?? []) as unknown as RelationshipLinkData[];
  for (const enlace of enlaces) {
    if (!enlace || enlace.isGhost) continue;
    const key = claveRelacion(enlace.from, enlace.category, enlace.to);
    estado.relaciones.set(key, {
      key,
      from: String(enlace.from),
      to: String(enlace.to),
      category: enlace.category,
      fromMultiplicity: enlace.fromMultiplicity,
      toMultiplicity: enlace.toMultiplicity,
      name: enlace.name,
    });
  }

  return estado;
}
