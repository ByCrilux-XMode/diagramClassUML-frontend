/**
 * visionSchema.ts
 * ---------------
 * Contrato zod para la SALIDA de la ruta de visión (diagrams2sql → JSON).
 *
 * Es el "cemento" entre el modelo de visión (que NO conoce nuestros tools
 * del editor) y el mapper determinístico (schemaToToolCalls.ts).
 *
 * - `type` se acepta como string LAXO y se normaliza en typeNormalizer.ts
 *   (int/integer, varchar/string, decimal/real...). NUNCA rechazamos por tipo.
 * - La validación CRUZADA fuerte vive acá: toda tabla referida en
 *   `relationships[].from_table/to_table` DEBE existir en `tables`.
 *   Si no existe → deja la relación fuera (no inventamos tablas).
 * - Métodos NO se distinguen acá: los detecta typeNormalizer (verbo/void).
 */
import { z } from "zod";

export const VISION_COLUMN_SCHEMA = z.object({
  name: z.string().trim().min(1),
  type: z.string().trim().min(1).default("string"),
  nullable: z.boolean().nullable().optional(),
  primary_key: z.boolean().nullable().optional(),
  default: z.unknown().optional(),
});
export type VisionColumn = z.infer<typeof VISION_COLUMN_SCHEMA>;

export const VISION_RELATIONSHIP_SCHEMA = z.object({
  from_table: z.string().trim().min(1),
  // Columnas FK opcionales: la visión a veces solo da from/to (estilo R1).
  // El mapper las usa solo como label del link, así que "" es válido.
  from_column: z.string().trim().optional().default(""),
  to_table: z.string().trim().min(1),
  to_column: z.string().trim().optional().default(""),
  many_to_one: z.boolean().optional(),
});
export type VisionRelationship = z.infer<typeof VISION_RELATIONSHIP_SCHEMA>;

export const VISION_OUTPUT_SCHEMA = z.object({
  domain: z.string().trim().optional().default(""),
  tables: z
    .array(
      z.object({
        name: z.string().trim().min(1, "El nombre de la tabla es obligatorio."),
        columns: z.array(VISION_COLUMN_SCHEMA).default([]),
      })
    )
    .default([]),
  relationships: z.array(VISION_RELATIONSHIP_SCHEMA).default([]),
});
export type VisionOutput = z.infer<typeof VISION_OUTPUT_SCHEMA>;

/**
 * normalizeVisionKeys: la visión a veces desobedece el contrato y devuelve
 * claves en español (tablas/columnas/relaciones, como en el test R1) o
 * variantes (nombre/tipo, from/to sueltos). El zod es estricto en inglés,
 * así que este normalizador traduce claves por NIVEL antes del safeParse.
 * Por nivel (no global) para no renombrar datos: una columna llamada "de"
 * o "origen" NO debe tocarse; solo las claves estructurales conocidas.
 */
const TOP_ALIASES: Record<string, "domain" | "tables" | "relationships"> = {
  domain: "domain",
  dominio: "domain",
  tables: "tables",
  tablas: "tables",
  entidades: "tables",
  clases: "tables",
  relationships: "relationships",
  relaciones: "relationships",
  relacion: "relationships",
  relationship: "relationships",
};

const TABLE_ALIASES: Record<string, "name" | "columns"> = {
  name: "name",
  nombre: "name",
  tabla: "name",
  columns: "columns",
  columnas: "columns",
  atributos: "columns",
  attributes: "columns",
  campos: "columns",
};

const COLUMN_ALIASES: Record<string, "name" | "type" | "nullable" | "primary_key" | "default"> = {
  name: "name",
  nombre: "name",
  type: "type",
  tipo: "type",
  nullable: "nullable",
  nulo: "nullable",
  primary_key: "primary_key",
  clave_primaria: "primary_key",
  primarykey: "primary_key",
  pk: "primary_key",
  default: "default",
  defecto: "default",
};

const REL_ALIASES: Record<string, "from_table" | "from_column" | "to_table" | "to_column" | "many_to_one"> = {
  from_table: "from_table",
  tabla_origen: "from_table",
  origen: "from_table",
  from: "from_table",
  de: "from_table",
  from_column: "from_column",
  columna_origen: "from_column",
  to_table: "to_table",
  tabla_destino: "to_table",
  destino: "to_table",
  to: "to_table",
  a: "to_table",
  to_column: "to_column",
  columna_destino: "to_column",
  many_to_one: "many_to_one",
  muchos_a_uno: "many_to_one",
  manytoone: "many_to_one",
};

function mapKeys(value: unknown, aliases: Record<string, string>): unknown {
  if (Array.isArray(value)) return value.map((v) => mapKeys(v, aliases));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const canon = aliases[k.trim().toLowerCase()] ?? k;
      out[canon] = v;
    }
    return out;
  }
  return value;
}

/** Traduce claves ES→EN por nivel. Entrada: JSON crudo de la visión. Salida: misma forma, claves canónicas. */
export function normalizeVisionKeys(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const top = mapKeys(raw, TOP_ALIASES) as Record<string, unknown>;
  if (Array.isArray(top.tables)) {
    top.tables = (top.tables as unknown[]).map((t) => {
      const tt = mapKeys(t, TABLE_ALIASES) as Record<string, unknown>;
      if (Array.isArray(tt.columns)) tt.columns = mapKeys(tt.columns, COLUMN_ALIASES);
      return tt;
    });
  }
  if (Array.isArray(top.relationships)) {
    top.relationships = mapKeys(top.relationships, REL_ALIASES);
  }
  return top;
}

/** Extensión post-parse: aplica la validación cruzada de foreign keys. */
export function validateCrossReferences(schema: VisionOutput): {
  ok: boolean;
  value: VisionOutput;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (schema.tables.length === 0 && schema.relationships.length === 0) {
    return { ok: false, value: schema, warnings: ["La imagen no contiene datos legibles."] };
  }
  const known = new Set(schema.tables.map((t) => t.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
  const relationships = schema.relationships.filter((r) => {
    const from = r.from_table.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const to = r.to_table.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!known.has(from)) {
      warnings.push(`Relación ignorada: la tabla origen '${r.from_table}' no existe en el esquema.`);
      return false;
    }
    if (!known.has(to)) {
      warnings.push(`Relación ignorada: la tabla destino '${r.to_table}' no existe en el esquema.`);
      return false;
    }
    if (from === to) {
      warnings.push(`Relación ignorada: '${r.from_table}' no puede relacionarse consigo misma (autoreferencia no soportada).`);
      return false;
    }
    return true;
  });
  return { ok: true, value: { ...schema, relationships }, warnings };
}
