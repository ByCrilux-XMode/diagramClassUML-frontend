/** Claves internas de GoJS, Mongo y UUID que nunca deben verse en la bitácora. */
const CLAVE_NODO = /^(node|nodo)-\d+/i;
const CLAVE_GHOST = /^ghost-/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJETO_ID = /^[0-9a-f]{24}$/i;
const CLAVE_OPACA = /^(node|nodo|clase|class|rel|relacion|link|ghost)-[0-9a-f-]{8,}$/i;

/** Los campos del diff son técnicos; en la interfaz se muestran en español. */
export const ETIQUETA_CAMPO: Record<string, string> = {
  name: "Nombre",
  type: "Tipo",
  visibility: "Visibilidad",
  multiplicity: "Multiplicidad",
  defaultValue: "Valor por defecto",
  isStatic: "Estático",
  isDerived: "Derivado",
  isReadOnly: "Solo lectura",
  returnType: "Tipo de retorno",
  parameters: "Parámetros",
  category: "Tipo",
  isAbstract: "Abstracta",
  literals: "Literales",
  attributes: "Atributos",
  methods: "Métodos",
  from: "Origen",
  to: "Destino",
  fromMultiplicity: "Multiplicidad origen",
  toMultiplicity: "Multiplicidad destino",
};

export function etiquetaCampo(campo: string): string {
  return ETIQUETA_CAMPO[campo] ?? campo;
}

function esClaveTecnica(valor: unknown): boolean {
  if (typeof valor !== "string") return false;
  const clave = valor.trim();
  return (
    clave === "" ||
    clave === "undefined" ||
    CLAVE_NODO.test(clave) ||
    CLAVE_GHOST.test(clave) ||
    UUID.test(clave) ||
    OBJETO_ID.test(clave) ||
    CLAVE_OPACA.test(clave)
  );
}

export { esClaveTecnica };

/**
 * Texto legible de una clave de entidad. Las claves del modelo (`pedido`,
 * `empresa-1`) son identificadores internos: se muestran como texto humano y,
 * si no queda nada legible, se omiten en vez de enseñar la clave.
 */
export function etiquetaEntidad(valor: unknown): string {
  if (typeof valor !== "string") return "";
  const clave = valor.trim();
  if (esClaveTecnica(clave)) return "";
  const texto = clave.replace(/[-_]+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (!texto || esClaveTecnica(texto)) return "";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
