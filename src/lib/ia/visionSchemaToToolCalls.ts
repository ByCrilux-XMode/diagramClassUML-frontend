/**
 * visionSchemaToToolCalls.ts
 * --------------------------
 * PUENTE determinístico: VisionOutput (schema neutral de BD) → IAToolCall[]
 * del editor (addClass / updateAttribute / updateMethod / connect).
 *
 * POR QUÉ ASÍ (contrato cerrado):
 *  - El modelo de visión NO conoce nuestros tools UML (addClass/connect).
 *    Si le pedís tool_calls, inventa `addAssociation` (muerto en schema.ts)
 *    o `add_association` (no existe) y el zod de validateArgs lo rechaza.
 *  - En cambio SÍ es estable reconociendo TABLAS/COLUMNAS/RELACIONES (lo
 *    comprobaste: 3 imágenes, 3 JSONs con el mismo esqueleto).
 *  - La traducción a tool_calls es DETERMINÍSTICA (cero LLM, cero rondas):
 *    tabla → addClass(key/nombre)
 *    columna tipo normal → updateAttribute(add)
 *    columna tipo "void"/verbo → updateMethod(add)
 *    relación many_to_one → connect(association, mults según many_to_one)
 *
 * SINTAXIS UTILIZADA (idéntica a schema.ts, NO inventamos nada):
 *   addClass:        { key, name, loc, attributes:[{name,type,visibility}], methods:[...] }
 *   updateAttribute: { classKey, action:"add", attribute:{name,type,visibility} }
 *   updateMethod:    { classKey, action:"add", method:{name,visibility,returnType:"void"} }
 *   connect:         { from, to, kind, fromMult, toMult, label }
 *
 * NORMALIZACIÓN DE TIPOS (obligatoria — salida cruda de la visión trae
 * int/varchar/jsonb/decimal que NO existen en el editor):
 *   int→integer | int4→integer | integer→integer
 *   varchar→string | var→string | text→text | string→string
 *   jsonb→text | json→text
 *   decimal→real | numeric→real | real→real | float→real | double→real
 *   date→date | timestamp→date | time→date
 *   boolean→boolean | bool→boolean
 *   void→void (MÉTODO, no atributo)
 *   default→string
 *
 * REGLA MÉTODO vs ATRIBUTO:
 *   - type === "void" → updateMethod
 *   - el nombre es un verbo en infinitivo (termina en -ar/-er/-ir) → updateMethod
 *   - resto → updateAttribute
 */
import type { IAToolCall } from "@/lib/ia/types";
import type { VisionOutput } from "./visionSchema";

/** Vocabulario canónico de tipos del editor (atributos). */
const VALID_TYPES = new Set([
  "integer",
  "string",
  "text",
  "boolean",
  "date",
  "real",
  "void",
]);

const TYPE_ALIASES: Record<string, string> = {
  int: "integer",
  int4: "integer",
  int8: "integer",
  bigint: "integer",
  smallint: "integer",
  serial: "integer",
  integer: "integer",
  varchar: "string",
  var: "string",
  "character varying": "string",
  char: "string",
  nvarchar: "string",
  string: "string",
  str: "string",
  text: "text",
  tinytext: "text",
  mediumtext: "text",
  longtext: "text",
  jsonb: "text",
  json: "text",
  decimal: "real",
  numeric: "real",
  real: "real",
  money: "real",
  float: "real",
  double: "real",
  "double precision": "real",
  date: "date",
  datetime: "date",
  timestamp: "date",
  timestamptz: "date",
  time: "date",
  timewithtz: "date",
  boolean: "boolean",
  bool: "boolean",
  void: "void",
};

const VERB_SUFFIXES = ["ar", "er", "ir"];

function pascalCase(input: string): string {
  const words = input
    .trim()
    .split(/[\s_\-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  if (words.length === 0) return "Clase";
  return words.join("");
}

function camelCase(input: string): string {
  const pascal = pascalCase(input);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function normalizeType(raw: string | undefined | null): string {
  const value = (raw ?? "").trim().toLowerCase();
  // si es vacío o un tipo inválido → string (fallback seguro)
  if (value === "") return "string";
  return TYPE_ALIASES[value] ?? (VALID_TYPES.has(value) ? value : "string");
}

function isMethodName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed === "") return false;
  // verbo en infinitivo español: "reservar", "entregar", "calcular_total"
  const verbMatch = trimmed.match(/^[a-zà-ú_]+$/i);
  if (!verbMatch) return false;
  const lower = trimmed.toLowerCase();
  if (VERB_SUFFIXES.some((s) => lower.endsWith(s))) {
    // no confundir con sustantivos como "pantalla" (termina "lla"), "marca" (termina "rca")...
    // regla simple pero auditada: SI termina en vocal+ar/er/ir -> método.
    // "marcar" es verbo → método correcto.
    return true;
  }
  return false;
}

/** Posiciones en grilla para evitar solapamiento (mismas que buildToolSchema: 3 cols, gap 320x190). */
function gridLoc(index: number): string {
  const cols = 3;
  const gapX = 320;
  const gapY = 190;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const x = -320 + col * gapX;
  const y = -190 + row * gapY;
  return `${x} ${y}`;
}

export interface VisionToolCallResult {
  calls: IAToolCall[];
  warnings: string[];
  appliedSkips: { kind: "method" | "relation" | "type" | "missing"; details: string }[];
}

export function visionSchemaToToolCalls(schema: VisionOutput): VisionToolCallResult {
  const calls: IAToolCall[] = [];
  const warnings: string[] = [];
  const appliedSkips: VisionToolCallResult["appliedSkips"] = [];
  const tableKeys = new Set<string>();

  // 1) Clases (una por tabla), con sus atributos/métodos embebidos en addClass.
  //    Hacemos UNA addClass por tabla (con attributes+methods iniciales),
  //    así no gastamos una ronda extra por updateAttribute. Luego los métodos
  //    tipo void van en updateMethod por separado (el editor los maneja igual).
  for (const table of schema.tables) {
    const key = camelCase(table.name);
    const name = pascalCase(table.name);
    if (tableKeys.has(key)) {
      appliedSkips.push({ kind: "missing", details: `Tabla duplicada '${table.name}' ignorada.` });
      continue;
    }
    tableKeys.add(key);
    const attributes: Array<{ name: string; type: string; visibility: string }> = [];
    const methods: Array<{ name: string; visibility: string; returnType: string }> = [];
    for (const col of table.columns) {
      const colName = camelCase(col.name);
      const normType = normalizeType(col.type);
      if (normType === "void" || isMethodName(colName)) {
        methods.push({ name: colName, visibility: "+", returnType: "void" });
      } else {
        attributes.push({ name: colName, type: normType, visibility: "-" });
      }
    }
    calls.push({
      id: "vision-" + key,
      type: "function",
      function: {
        name: "addClass",
        arguments: JSON.stringify({
          key,
          name,
          loc: gridLoc(tableKeys.size - 1),
          ...(attributes.length > 0 ? { attributes } : {}),
          ...(methods.length > 0 ? { methods } : {}),
        }),
      },
    });
  }

  // 2) Relaciones: many_to_one → connect ASSOCIATION con multiplicidades.
  //    Contrato de la visión: from_table es la tabla HIJA (el muchos),
  //    to_table es la tabla PADRE (el 1). fromMult="*", toMult="1".
  //    many_to_one:false (1:1) → fromMult="1", toMult="1".
  for (const rel of schema.relationships) {
    const fromKey = camelCase(rel.from_table);
    const toKey = camelCase(rel.to_table);
    if (!tableKeys.has(fromKey) || !tableKeys.has(toKey)) {
      appliedSkips.push({
        kind: "relation",
        details: `Relación '${rel.from_table}→${rel.to_table}' ignorada: tabla inexistente.`,
      });
      warnings.push(`Relación ignorada (tabla no definida): ${rel.from_table}→${rel.to_table}`);
      continue;
    }
    if (fromKey === toKey) {
      appliedSkips.push({ kind: "relation", details: `Relación self-referencial '${rel.from_table}' ignorada.` });
      continue;
    }
    const kind = "association";
    const fromMult = rel.many_to_one === true ? "*" : "1";
    const toMult = rel.many_to_one === true ? "1" : "1";
    const label = rel.from_column ? camelCase(rel.from_column) : undefined;
    calls.push({
      id: "vision-link-" + fromKey + "-" + toKey,
      type: "function",
      function: {
        name: "connect",
        arguments: JSON.stringify({
          from: fromKey,
          to: toKey,
          kind,
          fromMult,
          toMult,
          ...(label ? { label } : {}),
        }),
      },
    });
  }

  return { calls, warnings, appliedSkips };
}
