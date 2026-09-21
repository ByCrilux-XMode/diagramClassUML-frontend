// Utilidades de sanitización y mapeo UML -> Java para el generador de backend.
// Módulo puro: sin dependencias de navegador, seguro para importar en cliente.

const JAVA_KEYWORDS = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
  "class", "const", "continue", "default", "do", "double", "else", "enum",
  "extends", "final", "finally", "float", "for", "goto", "if", "implements",
  "import", "instanceof", "int", "interface", "long", "native", "new",
  "package", "private", "protected", "public", "return", "short", "static",
  "strictfp", "super", "switch", "synchronized", "this", "throw", "throws",
  "transient", "try", "void", "volatile", "while", "true", "false", "null",
  "var", "record", "sealed", "permits", "yield",
]);

/** Minúsculas, sin tildes, sin "_" ni espacios. Ej: "Persona_id" -> "personaId"->"personaid". */
export function normalizeName(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\s-]+/g, "");
}

/** Capitaliza: "persona" -> "Persona". */
export function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Minusculiza primera letra: "Persona" -> "persona". */
export function uncapitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Nombre de clase Java válido a partir del nombre UML.
 * Quita tildes/espacios/guiones, respeta camelCase interno, evita keywords.
 */
export function toClassName(raw: string, fallback: string): string {
  let s = (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_]/g, "");
  if (!s) s = fallback;
  if (/^[0-9]/.test(s)) s = `C${s}`;
  s = capitalize(s);
  if (JAVA_KEYWORDS.has(s.toLowerCase())) s = `${s}Entity`;
  return s;
}

/**
 * Nombre de campo/atributo Java (camelCase) a partir del nombre UML.
 * "persona_id" -> "personaId", "nombre" -> "nombre".
 */
export function toFieldName(raw: string, fallback: string): string {
  let s = (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_]/g, "");
  if (!s) s = fallback;
  const parts = s.split("_").filter(Boolean);
  s =
    parts.length > 1
      ? parts[0].toLowerCase() + parts.slice(1).map(capitalize).join("")
      : uncapitalize(s);
  if (/^[0-9]/.test(s)) s = `f${s}`;
  if (JAVA_KEYWORDS.has(s)) s = `${s}Field`;
  return s;
}

/** snake_case para nombres de columna/tabla: "personaId" -> "persona_id". */
export function toSnake(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");
}

/** Slug del proyecto para paquete Java: "Mi Proyecto!" -> "miproyecto". */
export function toPackageSlug(nombre: string): string {
  const s = (nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return s || "app";
}

/** Nombre de recurso REST en plural simple: "usuario" -> "usuarios". */
export function toResourcePlural(javaName: string): string {
  const base = javaName.toLowerCase();
  return base.endsWith("s") ? `${base}es` : `${base}s`;
}

export interface JavaTypeMapping {
  javaType: string;
  importExtra?: string;
  sampleJson: string;
}

/** Mapeo de tipos UML (texto libre) -> tipo Java + valor de ejemplo para Postman. */
export function mapUmlTypeToJava(rawType: string | undefined): JavaTypeMapping {
  const t = (rawType ?? "").trim().toLowerCase();
  switch (t) {
    case "":
    case "string":
      return { javaType: "String", sampleJson: '"texto"' };
    case "int":
    case "integer":
    case "short":
    case "byte":
      return { javaType: "Integer", sampleJson: "1" };
    case "long":
    case "unlimitednatural":
      return { javaType: "Long", sampleJson: "1" };
    case "real":
    case "float":
    case "double":
    case "decimal":
      return { javaType: "Double", sampleJson: "1.5" };
    case "boolean":
    case "bool":
      return { javaType: "Boolean", sampleJson: "true" };
    case "date":
    case "localdate":
      return { javaType: "LocalDate", importExtra: "java.time.LocalDate", sampleJson: '"2024-01-01"' };
    case "datetime":
    case "localdatetime":
      return { javaType: "LocalDateTime", importExtra: "java.time.LocalDateTime", sampleJson: '"2024-01-01T10:00:00"' };
    case "char":
    case "character":
      return { javaType: "String", sampleJson: '"A"' };
    default:
      // Tipo de dominio desconocido -> String (genera warning en el mapper).
      return { javaType: "String", sampleJson: '"texto"' };
  }
}

/** Tipos que se consideran "desconocidos" (de dominio) para emitir warning. */
export function isKnownUmlType(rawType: string | undefined): boolean {
  const t = (rawType ?? "").trim().toLowerCase();
  return [
    "", "string", "int", "integer", "short", "byte", "long", "unlimitednatural",
    "real", "float", "double", "decimal", "boolean", "bool", "date",
    "localdate", "datetime", "localdatetime", "char", "character",
  ].includes(t);
}
