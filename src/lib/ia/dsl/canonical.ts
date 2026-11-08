/**
 * Contrato del DSL canónico del diagrama UML.
 *
 * Es la proyección que recibe y devuelve el modelo para el Space propio de
 * Hugging Face. El modelo NO elige tools: devuelve el diagrama completo y el
 * frontend calcula un diff determinístico contra el estado actual.
 *
 * Los nombres de campo van en español (igual que la instrucción del usuario),
 * pero los valores de los enums van en inglés porque son los tokens con los
 * que el modelo fue entrenado.
 */

export type EntidadTipo = "class" | "interface" | "abstract" | "enumeration";

export type TipoRelacion =
  | "inheritance"
  | "implementation"
  | "association"
  | "aggregation"
  | "composition"
  | "dependency";

export type Visibilidad = "public" | "private" | "protected" | "package";

/** Atributo dentro del DSL canónico. */
export interface CampoCanonico {
  visibilidad?: Visibilidad;
  nombre: string;
  tipo?: string;
  multiplicidad?: string;
  valor?: string;
  estatico?: boolean;
  readonly?: boolean;
  derivado?: boolean;
}

/** Parámetro de un método. */
export interface ParametroCanonico {
  nombre: string;
  tipo: string;
  direccion?: "in" | "out" | "inout";
  valor?: string;
}

/** Método dentro del DSL canónico. */
export interface MetodoCanonico {
  visibilidad?: Visibilidad;
  nombre: string;
  parametros?: ParametroCanonico[];
  retorno?: string;
  multiplicidad?: string;
  estatico?: boolean;
  abstracto?: boolean;
}

/** Entidad del diagrama. */
export interface EntidadCanonica {
  id: string;
  tipo: EntidadTipo;
  nombre: string;
  atributos?: CampoCanonico[];
  metodos?: MetodoCanonico[];
  literales?: string[];
  /**
   * Interno: `false` si el modelo omitió `tipo` y se usó el valor por defecto.
   * El diff conserva entonces el tipo actual en lugar de asumir un cambio.
   */
  tipoExplicito?: boolean;
  /** Interno: el modelo no incluyó `atributos`; el diff conserva los actuales. */
  atributosOmitidos?: boolean;
  /** Interno: el modelo no incluyó `metodos`; el diff conserva los actuales. */
  metodosOmitidos?: boolean;
  /** Interno: el modelo no incluyó `literales`; el diff conserva los actuales. */
  literalesOmitidos?: boolean;
  /** Interno: el modelo no incluyó `id`; el diff empareja solo por nombre. */
  idImplicito?: boolean;
}

/** Relación entre dos entidades. */
export interface RelacionCanonica {
  id: string;
  origen: string;
  destino: string;
  tipo: TipoRelacion;
  origenMult?: string;
  destinoMult?: string;
  etiqueta?: string;
  origenRol?: string;
  destinoRol?: string;
  /** Interno: igual que `EntidadCanonica.tipoExplicito`. */
  tipoExplicito?: boolean;
  /** Interno: el modelo no incluyó `id`; el diff empareja por extremos y tipo. */
  idImplicito?: boolean;
}

export interface DiagramaCanonico {
  entidades: EntidadCanonica[];
  relaciones: RelacionCanonica[];
}

/** Herramientas de lectura que el DSL puede pedir antes de editar. */
export type ConsultaHerramienta =
  | "consultarHistorial"
  | "consultarPlan"
  | "getState"
  | "validate";

export interface ConsultaCanonica {
  herramienta: ConsultaHerramienta;
  args?: Record<string, unknown>;
}

export type SalidaTipo = "chat" | "diagrama" | "consulta";

/** Salida completa del modelo. */
export interface SalidaModelo {
  tipo: SalidaTipo;
  mensaje: string;
  entidades?: EntidadCanonica[];
  relaciones?: RelacionCanonica[];
  consultas?: ConsultaCanonica[];
  /**
   * Interno: el modelo no incluyó la clave `relaciones`. El adaptador
   * conserva las relaciones actuales en vez de asumir que deben borrarse.
   */
  relacionesOmitidas?: boolean;
}

export const TIPOS_ENTIDAD: readonly EntidadTipo[] = [
  "class",
  "interface",
  "abstract",
  "enumeration",
];

export const TIPOS_RELACION: readonly TipoRelacion[] = [
  "inheritance",
  "implementation",
  "association",
  "aggregation",
  "composition",
  "dependency",
];

export const VISIBILIDADES: readonly Visibilidad[] = [
  "public",
  "private",
  "protected",
  "package",
];

export const CONSULTAS_PERMITIDAS: readonly ConsultaHerramienta[] = [
  "consultarHistorial",
  "consultarPlan",
  "getState",
  "validate",
];

/** Normaliza el tipo de entidad aceptando aliases habituales del modelo. */
export function normalizarTipoEntidad(valor: unknown): EntidadTipo | null {
  const texto = String(valor ?? "").trim().toLowerCase();
  if (texto === "") return null;
  if (texto === "class" || texto === "clase") return "class";
  if (texto === "interface" || texto === "interfaz") return "interface";
  if (texto === "abstract" || texto === "abstracta" || texto === "abstract class") {
    return "abstract";
  }
  if (
    texto === "enumeration" ||
    texto === "enum" ||
    texto === "enumeracion" ||
    texto === "enumeración"
  ) {
    return "enumeration";
  }
  return null;
}

/** Normaliza el tipo de relación al vocabulario del DSL. */
export function normalizarTipoRelacion(valor: unknown): TipoRelacion | null {
  const texto = String(valor ?? "").trim().toLowerCase();
  if (texto === "") return null;
  if (texto === "inheritance" || texto === "herencia" || texto === "generalization") {
    return "inheritance";
  }
  if (
    texto === "implementation" ||
    texto === "realization" ||
    texto === "realizacion" ||
    texto === "realización"
  ) {
    return "implementation";
  }
  if (texto === "association" || texto === "asociacion" || texto === "asociación") {
    return "association";
  }
  if (texto === "aggregation" || texto === "agregacion" || texto === "agregación") {
    return "aggregation";
  }
  if (texto === "composition" || texto === "composicion" || texto === "composición") {
    return "composition";
  }
  if (texto === "dependency" || texto === "dependencia") return "dependency";
  return null;
}

/** Normaliza la visibilidad aceptando símbolos y variantes en español. */
export function normalizarVisibilidad(valor: unknown): Visibilidad {
  const texto = String(valor ?? "").trim().toLowerCase();
  if (texto === "+" || texto === "public" || texto === "publico" || texto === "público") {
    return "public";
  }
  if (texto === "-" || texto === "private" || texto === "privado") return "private";
  if (texto === "#" || texto === "protected" || texto === "protegido") return "protected";
  if (texto === "~" || texto === "package" || texto === "paquete") return "package";
  return "public";
}

/** Símbolo que usan las tools del editor para la visibilidad. */
export function simboloVisibilidad(valor: Visibilidad | undefined): "+" | "-" | "#" | "~" {
  switch (valor ?? "public") {
    case "private":
      return "-";
    case "protected":
      return "#";
    case "package":
      return "~";
    default:
      return "+";
  }
}

/** Visibilidad a partir del símbolo que aparece en el snapshot del prompt. */
export function visibilidadDesdeSimbolo(valor: string | undefined): Visibilidad {
  switch (valor) {
    case "-":
      return "private";
    case "#":
      return "protected";
    case "~":
      return "package";
    default:
      return "public";
  }
}

/** Tipo de relación que acepta la tool `connect` del editor. */
export function tipoRelacionFrontend(
  tipo: TipoRelacion,
): "association" | "aggregation" | "composition" | "generalization" | "dependency" | "realization" {
  switch (tipo) {
    case "inheritance":
      return "generalization";
    case "implementation":
      return "realization";
    default:
      return tipo;
  }
}

/** Categoría de nodo que usa el editor para cada tipo canónico. */
export function categoriaEntidad(tipo: EntidadTipo): {
  category: "Class" | "Interface" | "Enum";
  isAbstract?: boolean;
} {
  switch (tipo) {
    case "interface":
      return { category: "Interface" };
    case "enumeration":
      return { category: "Enum" };
    case "abstract":
      return { category: "Class", isAbstract: true };
    default:
      return { category: "Class" };
  }
}

/** Normaliza un nombre para comparar entidades entre actual y deseado. */
export function normalizarNombre(valor: unknown): string {
  return String(valor ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
