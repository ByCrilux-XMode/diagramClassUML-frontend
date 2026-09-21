// Núcleo del generador: UmlModelData -> BackendModel (listo para plantillas Java).
// Módulo puro: sin dependencias de navegador.
//
// Decisiones (plan cerrado):
// - Sin N:M: un link many/many se omite con warning (el examen usa entidad intermedia).
// - 1:1 estricta: default alfabético + flag ambiguous (el modal deja elegir lado).
// - PK por convención: ^id$ | ^{Clase}_?id$ | ^id_?{Clase}$ (insensible a mayúsculas).
// - Atributos con pinta de FK manual se ignoran (la FK la genera el link).

import type { UmlModelData, UmlNodeData, MethodData } from "@/types/uml";
import { classifyMultiplicity, parseMultiplicity } from "@/lib/rules";
import {
  capitalize,
  isKnownUmlType,
  mapUmlTypeToJava,
  normalizeName,
  toClassName,
  toFieldName,
  toPackageSlug,
  toSnake,
  uncapitalize,
} from "./utils";

/** Convierte un nombre a camelCase válido para Java. */
function toJavaName(raw: string, fallback: string): string {
  const s = (raw ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9_]/g, "");
  const clean = !s || /^[0-9]/.test(s) ? fallback : s.charAt(0).toLowerCase() + s.slice(1);
  return clean;
}

/** Mapea un tipo UML a tipo Java. */
function mapUmlType(t: string | undefined): { javaType: string; sampleJson: string; importExtra?: string } {
  const known: Record<string, { javaType: string; sampleJson: string; importExtra?: string }> = {
    String: { javaType: "String", sampleJson: '"texto"' },
    Integer: { javaType: "Integer", sampleJson: "1" },
    Long: { javaType: "Long", sampleJson: "1" },
    Double: { javaType: "Double", sampleJson: "1.5" },
    Boolean: { javaType: "Boolean", sampleJson: "true" },
    LocalDate: { javaType: "LocalDate", sampleJson: '"2024-01-01"', importExtra: "import java.time.LocalDate;" },
    LocalDateTime: { javaType: "LocalDateTime", sampleJson: '"2024-01-01T10:00:00"', importExtra: "import java.time.LocalDateTime;" },
  };
  return known[t ?? ""] ?? { javaType: "String", sampleJson: '"texto"' };
}

/** Recolecta métodos UML de las clases y los mapea a firmas Java (para info en preview). */
function collectJavaMethods(nodes: UmlNodeData[], knownTypes: Map<string, string> = new Map()): {
  byEntityKey: Map<string, JavaMethod[]>;
  warnings: string[];
  skipped: string[];
} {
  const byEntityKey = new Map<string, JavaMethod[]>();
  const warnings: string[] = [];
  const skipped: string[] = [];

  for (const n of nodes) {
    if (n.category !== "Class") {
      const methods = n.category === "Interface" ? n.methods?.length ?? 0 : 0;
      if (methods > 0) skipped.push(`Interfaz "${n.name}": sus ${methods} método(s) no generan backend.`);
      continue;
    }
    const list: JavaMethod[] = [];
    const seen = new Set<string>();
    (n.methods ?? []).forEach((m, i) => {
      const resolve = (t: string | undefined): string => {
        const hit = knownTypes.get(normalizeName(t ?? ""));
        if (hit) return hit;
        return mapUmlType(t).javaType;
      };
      const isKnown = (t: string | undefined): boolean =>
        knownTypes.has(normalizeName(t ?? "")) || Object.keys(mapUmlType("")).includes(t ?? "");
      const params = (m.parameters ?? []).map((p, pi) => {
        const jt = resolve(p.type);
        if (!isKnown(p.type)) warnings.push(`Método "${n.name}.${m.name}": param "${p.name}": "${p.type || "(vacío)"}" mapeado a String.`);
        return { name: toJavaName(p.name, `arg${pi + 1}`), javaType: jt };
      });
      const retRaw = (m.returnType ?? "").trim().toLowerCase();
      const returnJavaType = retRaw === "" || retRaw === "void" ? "void" : resolve(m.returnType);
      if (retRaw !== "" && retRaw !== "void" && !isKnown(m.returnType)) {
        warnings.push(`Método "${n.name}.${m.name}": retorno: "${m.returnType}" mapeado a String.`);
      }
      const javaName = toJavaName(m.name, `metodo${i + 1}`);
      list.push({
        entityKey: String(n.key),
        className: n.name,
        umlName: m.name,
        javaName,
        params,
        returnJavaType,
        abstractOnly: !!m.isAbstract,
      });
    });
    if (list.length > 0) byEntityKey.set(String(n.key), list);
  }
  return { byEntityKey, warnings, skipped };
}

export interface ScalarField {
  javaName: string;
  javaType: string;
  columnName: string;
  sampleJson: string;
  importExtra?: string;
}

export interface PkField {
  javaName: string;
  javaType: string;
  columnName: string;
  originalName: string;
  autoInjected: boolean;
}

export interface RelationField {
  javaName: string;
  targetClassName: string;
  columnName: string;
  kind: "many_to_one" | "one_to_one";
  linkKey: string;
}

export interface EntityModel {
  key: string;
  className: string;
  isAbstract: boolean;
  isParent: boolean;
  parentClassName: string | null;
  parentKey: string | null;
  pk: PkField | null; // null en hijas con herencia (heredan la PK del padre)
  scalars: ScalarField[];
  relations: RelationField[];
  /** Operaciones UML de la clase (firma Java; para info en preview). */
  methods: JavaMethod[];
  /** Interfaces que implementa (via realization). */
  implementedInterfaces: string[];
}

export interface InterfaceModel {
  className: string;
  methods: JavaMethod[];
}

export interface JavaMethod {
  entityKey: string;
  className: string;
  umlName: string;
  javaName: string;
  params: { name: string; javaType: string }[];
  returnJavaType: string;
  abstractOnly: boolean;
}

export interface DerivedQuery {
  javaName: string;
  signature: string;
}

/**
 * Genera métodos derivados de Spring Data JPA para cada atributo
 * (escalar y relación) de una entidad: findBy, getBy, existsBy,
 * countBy, findAllBy, deleteBy.
 */
export function deriveJpaQueries(e: EntityModel): DerivedQuery[] {
  const out: DerivedQuery[] = [];
  const add = (fieldName: string, fieldType: string) => {
    const cap = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
    const params = `${fieldType} ${fieldName}`;
    out.push({ javaName: `findBy${cap}`, signature: `Optional<${e.className}> findBy${cap}(${params});` });
    out.push({ javaName: `getBy${cap}`, signature: `${e.className} getBy${cap}(${params});` });
    out.push({ javaName: `existsBy${cap}`, signature: `boolean existsBy${cap}(${params});` });
    out.push({ javaName: `countBy${cap}`, signature: `long countBy${cap}(${params});` });
    out.push({ javaName: `findAllBy${cap}`, signature: `List<${e.className}> findAllBy${cap}(${params});` });
    out.push({ javaName: `deleteBy${cap}`, signature: `void deleteBy${cap}(${params});` });
  };
  if (e.pk) add(e.pk.javaName, e.pk.javaType);
  for (const s of e.scalars) add(s.javaName, s.javaType);
  for (const r of e.relations) add(r.javaName, r.targetClassName);
  return out;
}

export interface EnumModel {
  className: string;
  literals: string[];
}

export interface FkChoice {
  linkKey: string;
  fromKey: string;
  toKey: string;
  fromName: string;
  toName: string;
  kindLabel: string;
  defaultOwnerKey: string;
  ownerKey: string;
  columnName: string;
  ambiguous: boolean;
}

export interface BackendModel {
  packageName: string;
  appName: string;
  entities: EntityModel[];
  enums: EnumModel[];
  interfaces: InterfaceModel[];
  fkChoices: FkChoice[];
  skipped: string[];
  warnings: string[];
}

/** Normaliza el esquema guardado (nodeDataArray/linkDataArray o nodes/links) a UmlModelData. */
export function normalizeToUmlModel(raw: Record<string, unknown> | null): UmlModelData {
  if (!raw) return { nodes: [], links: [] };
  if (Array.isArray(raw["nodeDataArray"]) || Array.isArray(raw["linkDataArray"])) {
    return {
      nodes: ((raw["nodeDataArray"] as UmlModelData["nodes"]) ?? []) as UmlModelData["nodes"],
      links: ((raw["linkDataArray"] as UmlModelData["links"]) ?? []) as UmlModelData["links"],
    };
  }
  if (Array.isArray(raw["nodes"]) || Array.isArray(raw["links"])) {
    return {
      nodes: ((raw["nodes"] as UmlModelData["nodes"]) ?? []) as UmlModelData["nodes"],
      links: ((raw["links"] as UmlModelData["links"]) ?? []) as UmlModelData["links"],
    };
  }
  return { nodes: [], links: [] };
}

const FK_CATEGORIES = new Set(["association", "aggregation", "composition"]);

function sanitizeEnumLiteral(raw: string, index: number): string {
  const s = (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return s || `VALOR_${index + 1}`;
}

/** ¿El nombre del atributo coincide con la convención de PK de la clase? */
function isPkName(attrName: string, className: string): boolean {
  const a = normalizeName(attrName);
  const c = normalizeName(className);
  return a === "id" || a === `${c}id` || a === `id${c}`;
}

/** ¿Pinta de FK manual? (*_id / *Id que NO es la PK de su propia clase). */
function looksLikeManualFk(attrName: string, className: string): boolean {
  if (isPkName(attrName, className)) return false;
  const a = normalizeName(attrName);
  return a.endsWith("id") && a.length > 2;
}

export function buildBackendModel(
  model: UmlModelData,
  projectName: string,
  fkOverrides: Record<string, string> = {}
): BackendModel {
  const warnings: string[] = [];
  const skipped: string[] = [];
  const packageName = `com.example.${toPackageSlug(projectName)}`;
  const appName = `${capitalize(toPackageSlug(projectName)) || "App"}Application`;

  const nodeByKey = new Map<string, (typeof model.nodes)[number]>();
  for (const n of model.nodes) nodeByKey.set(String(n.key), n);

  // ---- Métodos UML -> firmas Java (para info en preview) ----
  // Se recolectan tras conocer los nombres finales de clases/enums para
  // resolver tipos de dominio (retornos y params como "Usuario").
  let collected = collectJavaMethods(model.nodes);

  // ---- Enums ----
  const enums: EnumModel[] = [];
  const enumClassByKey = new Map<string, string>();
  for (const n of model.nodes) {
    if (n.category !== "Enum") continue;
    const className = toClassName(n.name, `Enum${enums.length + 1}`);
    const literals = (n.literals ?? []).map((l, i) => sanitizeEnumLiteral(l, i));
    if (literals.length === 0) {
      skipped.push(`Enumeración "${n.name}": sin literales, se omite.`);
      continue;
    }
    enums.push({ className, literals });
    enumClassByKey.set(String(n.key), className);
  }

  // ---- Clases candidatas a entidad ----
  const classNodes = model.nodes.filter((n) => n.category === "Class");
  // (interfaces se procesan en segunda pasada)

  const classNameByKey = new Map<string, string>();
  const usedClassNames = new Set<string>();
  for (const n of classNodes) {
    let cn = toClassName(n.name, `Clase${usedClassNames.size + 1}`);
    let i = 2;
    while (usedClassNames.has(cn)) cn = `${toClassName(n.name, "Clase")}${i++}`;
    usedClassNames.add(cn);
    classNameByKey.set(String(n.key), cn);
  }

// ---- Interfaces (se recolectan en segunda pasada, pero map accesible para realizaciones) ----
  const interfaces: InterfaceModel[] = [];
  const interfaceClassByKey = new Map<string, string>();

  // Segunda pasada con tipos conocidos (clases + enums + interfaces generados).
  {
    const knownTypes = new Map<string, string>();
    for (const cn of usedClassNames) knownTypes.set(normalizeName(cn), cn);
    for (const en of enums) knownTypes.set(normalizeName(en.className), en.className);

    // ---- Interfaces ----
    for (const n of model.nodes) {
      if (n.category !== "Interface") continue;
      const className = toClassName(n.name, `Interface${interfaces.length + 1}`);
      const methods = (n.methods ?? []).map((m, i) => {
        const javaName = toJavaName(m.name, `metodo${i + 1}`);
        const resolve = (t: string | undefined): string => {
          const hit = knownTypes.get(normalizeName(t ?? ""));
          if (hit) return hit;
          return mapUmlType(t).javaType;
        };
        const params = (m.parameters ?? []).map((p, pi) => ({
          name: toJavaName(p.name, `arg${pi + 1}`),
          javaType: resolve(p.type),
        }));
        const retRaw = (m.returnType ?? "").trim().toLowerCase();
        const returnJavaType = retRaw === "" || retRaw === "void" ? "void" : resolve(m.returnType);
        return {
          entityKey: String(n.key),
          className,
          umlName: m.name,
          javaName,
          params,
          returnJavaType,
          abstractOnly: true,
        } as JavaMethod;
      });
      interfaces.push({ className, methods });
      interfaceClassByKey.set(String(n.key), className);
    }

    for (const cn of usedClassNames) knownTypes.set(normalizeName(cn), cn);
    for (const en of enums) knownTypes.set(normalizeName(en.className), en.className);
    for (const intf of interfaces) knownTypes.set(normalizeName(intf.className), intf.className);
    collected = collectJavaMethods(model.nodes, knownTypes);
  }
  warnings.push(...collected.warnings);
  skipped.push(...collected.skipped);

  // ---- Herencia (generalization Clase -> Clase) ----
  const parentKeyByChild = new Map<string, string>();
  const childrenCount = new Map<string, number>();
  for (const l of model.links) {
    if (l.category !== "generalization") continue;
    const from = nodeByKey.get(String(l.from));
    const to = nodeByKey.get(String(l.to));
    if (!from || !to || from.category !== "Class" || to.category !== "Class") {
      warnings.push(`Generalización "${String(l.key)}" ignorada: solo aplica entre clases.`);
      continue;
    }
    parentKeyByChild.set(String(l.from), String(l.to));
    childrenCount.set(String(l.to), (childrenCount.get(String(l.to)) ?? 0) + 1);
  }
  // ---- Realización (Class -> Interface: implements) ----
  const implementedByClass = new Map<string, string[]>();
  for (const l of model.links) {
    if (l.category !== "realization") continue;
    const from = nodeByKey.get(String(l.from));
    const to = nodeByKey.get(String(l.to));
    if (!from || !to) continue;
    if (from.category === "Class" && to.category === "Interface") {
      const className = classNameByKey.get(String(from.key));
      const interfaceName = interfaceClassByKey.get(String(to.key));
      if (className && interfaceName) {
        const arr = implementedByClass.get(String(from.key)) ?? [];
        arr.push(interfaceName);
        implementedByClass.set(String(from.key), arr);
      }
    } else {
      warnings.push(`Realización "${String(l.key)}" ignorada: solo Class -> Interface genera implements.`);
    }
  }
  for (const l of model.links) {
    if (l.category === "dependency") {
      skipped.push(
        `Relación dependency "${(nodeByKey.get(String(l.from))?.name ?? "?")}" → "${(nodeByKey.get(String(l.to))?.name ?? "?")}": no genera código.`
      );
    }
  }

  // ---- Relaciones FK (solo Class -> Class con categoría FK) ----
  interface PendingFk {
    linkKey: string;
    ownerKey: string;
    targetKey: string;
    kind: "many_to_one" | "one_to_one";
    ambiguous: boolean;
  }
  const pendingFks: PendingFk[] = [];
  const fkChoices: FkChoice[] = [];

  for (const l of model.links) {
    if (!FK_CATEGORIES.has(l.category)) continue;
    const from = nodeByKey.get(String(l.from));
    const to = nodeByKey.get(String(l.to));
    if (!from || !to) {
      warnings.push(`Relación "${String(l.key)}" ignorada: extremo inexistente.`);
      continue;
    }
    const fromIsClass = from.category === "Class";
    const toIsClass = to.category === "Class";

    // Class -> Enum: campo @Enumerated (no es FK).
    if (fromIsClass && to.category === "Enum") {
      const enumName = enumClassByKey.get(String(l.to));
      if (!enumName) {
        warnings.push(`Relación hacia enumeración "${to.name}" ignorada: enumeración omitida.`);
        continue;
      }
      (l as unknown as { __enumField?: string }).__enumField = enumName;
      continue;
    }
    if (!fromIsClass || !toIsClass) {
      warnings.push(
        `Relación ${l.category} "${from.name}" → "${to.name}" ignorada: las FK solo aplican entre clases.`
      );
      continue;
    }

    const fromClass = classifyMultiplicity(parseMultiplicity(l.fromMultiplicity));
    const toClass = classifyMultiplicity(parseMultiplicity(l.toMultiplicity));

    let ownerKey: string | null = null;
    let kind: "many_to_one" | "one_to_one" = "many_to_one";
    let ambiguous = false;

    if (fromClass === "many" && toClass !== "many") {
      ownerKey = String(l.from);
      kind = "many_to_one";
    } else if (toClass === "many" && fromClass !== "many") {
      ownerKey = String(l.to);
      kind = "many_to_one";
    } else if (fromClass === "many" && toClass === "many") {
      warnings.push(
        `Relación N:M "${from.name}" — "${to.name}" omitida: crea la entidad intermedia en el diagrama.`
      );
      continue;
    } else if (fromClass === "optional" && toClass !== "optional") {
      ownerKey = String(l.from);
      kind = "one_to_one";
    } else if (toClass === "optional" && fromClass !== "optional") {
      ownerKey = String(l.to);
      kind = "one_to_one";
    } else if (fromClass === "optional" && toClass === "optional") {
      // 0..1 — 0..1: default alfabético, ambiguo.
      ambiguous = true;
      kind = "one_to_one";
      ownerKey = defaultAlphabeticalOwner(String(l.from), String(l.to), classNameByKey);
    } else {
      // 1 — 1 estricto: default alfabético, ambiguo (el modal deja elegir).
      ambiguous = true;
      kind = "one_to_one";
      ownerKey = defaultAlphabeticalOwner(String(l.from), String(l.to), classNameByKey);
    }

    if (!ownerKey) continue;
    const override = fkOverrides[String(l.key)];
    const finalOwner = override && (override === String(l.from) || override === String(l.to)) ? override : ownerKey;
    pendingFks.push({ linkKey: String(l.key), ownerKey: finalOwner, targetKey: finalOwner === String(l.from) ? String(l.to) : String(l.from), kind, ambiguous });
    fkChoices.push({
      linkKey: String(l.key),
      fromKey: String(l.from),
      toKey: String(l.to),
      fromName: classNameByKey.get(String(l.from)) ?? from.name,
      toName: classNameByKey.get(String(l.to)) ?? to.name,
      kindLabel: kind === "many_to_one" ? "N:1" : "1:1",
      defaultOwnerKey: ownerKey,
      ownerKey: finalOwner,
      columnName: toSnake(classNameByKey.get(finalOwner === String(l.from) ? String(l.to) : String(l.from)) ?? "ref") + "_id",
      ambiguous,
    });
  }

  const fksByOwner = new Map<string, PendingFk[]>();
  for (const p of pendingFks) {
    const arr = fksByOwner.get(p.ownerKey) ?? [];
    arr.push(p);
    fksByOwner.set(p.ownerKey, arr);
  }

  // ---- Entidades ----
  const entities: EntityModel[] = [];
  for (const n of classNodes) {
    const key = String(n.key);
    const className = classNameByKey.get(key) ?? "Clase";
    const attrs = n.category === "Class" ? (n.attributes ?? []) : [];
    const parentKey = parentKeyByChild.get(key) ?? null;
    const parentClassName = parentKey ? (classNameByKey.get(parentKey) ?? null) : null;
    const isParent = (childrenCount.get(key) ?? 0) > 0;

    // PK: primera coincidencia por convención; hijas heredan la del padre.
    let pk: PkField | null = null;
    let pkAttrIndex = -1;
    if (!parentKey) {
      const matchIdx = attrs.findIndex((a) => isPkName(a.name, n.name));
      if (matchIdx >= 0) {
        pkAttrIndex = matchIdx;
        const a = attrs[matchIdx];
        const mapped = mapUmlTypeToJava(a.type);
        const pkType = mapped.javaType === "Integer" || mapped.javaType === "Long" ? mapped.javaType : "Long";
        if (pkType !== mapped.javaType) {
          warnings.push(`PK "${n.name}.${a.name}": tipo ${mapped.javaType} promovido a Long.`);
        }
        pk = {
          javaName: toFieldName(a.name, "id"),
          javaType: pkType,
          columnName: toSnake(toFieldName(a.name, "id")),
          originalName: a.name,
          autoInjected: false,
        };
      } else {
        pk = { javaName: "id", javaType: "Long", columnName: "id", originalName: "id", autoInjected: true };
        if (attrs.length > 0 || (fksByOwner.get(key) ?? []).length > 0) {
          warnings.push(`Clase "${n.name}": sin PK por convención, se inyecta "Long id" autogenerado.`);
        }
      }
    }

    // Escalares: todo atributo salvo PK y FKs manuales (se ignoran).
    const scalars: ScalarField[] = [];
    const scalarAttrIdx: number[] = [];
    const takenNames = new Set<string>();
    if (pk && !pk.autoInjected) takenNames.add(pk.javaName);
    attrs.forEach((a, idx) => {
      if (idx === pkAttrIndex) return;
      if (looksLikeManualFk(a.name, n.name)) {
        warnings.push(`Atributo "${n.name}.${a.name}" ignorado: las FK las generan las relaciones, no los atributos.`);
        return;
      }
      const mapped = mapUmlTypeToJava(a.type);
      if (!isKnownUmlType(a.type)) {
        warnings.push(`Atributo "${n.name}.${a.name}": tipo "${a.type || "(vacío)"}" mapeado a String.`);
      }
      let jn = toFieldName(a.name, `campo${idx + 1}`);
      let dup = 2;
      while (takenNames.has(jn)) jn = `${toFieldName(a.name, "campo")}${dup++}`;
      takenNames.add(jn);
      scalarAttrIdx.push(idx);
      scalars.push({
        javaName: jn,
        javaType: mapped.javaType,
        columnName: toSnake(jn),
        sampleJson: mapped.sampleJson,
        importExtra: mapped.importExtra,
      });
    });

    // Campo @Enumerated por relación Class -> Enum. Si ya existe un atributo
    // con ese tipo de dominio, se promueve a enum en vez de duplicar el campo.
    for (const l of model.links) {
      if (!FK_CATEGORIES.has(l.category) || String(l.from) !== key) continue;
      const enumName = (l as unknown as { __enumField?: string }).__enumField;
      if (!enumName) continue;
      const attrIdx = attrs.findIndex((a) => normalizeName(a.type) === normalizeName(enumName));
      if (attrIdx >= 0) {
        const pos = scalarAttrIdx.indexOf(attrIdx);
        if (pos >= 0) {
          scalars[pos].javaType = enumName;
          scalars[pos].sampleJson = `"${enums.find((e) => e.className === enumName)?.literals[0] ?? "VALOR"}"`;
          continue;
        }
      }
      let jn = uncapitalize(enumName);
      let dup = 2;
      while (takenNames.has(jn)) jn = `${uncapitalize(enumName)}${dup++}`;
      takenNames.add(jn);
      scalars.push({
        javaName: jn,
        javaType: enumName,
        columnName: toSnake(jn),
        sampleJson: `"${enums.find((e) => e.className === enumName)?.literals[0] ?? "VALOR"}"`,
      });
    }

    // Relaciones donde esta entidad es dueña.
    const relations: RelationField[] = [];
    for (const p of fksByOwner.get(key) ?? []) {
      const targetClass = classNameByKey.get(p.targetKey) ?? "Ref";
      let jn = uncapitalize(targetClass);
      let dup = 2;
      while (takenNames.has(jn)) jn = `${uncapitalize(targetClass)}${dup++}`;
      takenNames.add(jn);
      relations.push({
        javaName: jn,
        targetClassName: targetClass,
        columnName: toSnake(targetClass) + "_id",
        kind: p.kind,
        linkKey: p.linkKey,
      });
    }

    // Agregar métodos de interfaces implementadas como stubs
    const interfaceMethods: JavaMethod[] = [];
    for (const intfName of implementedByClass.get(key) ?? []) {
      const intf = interfaces.find((i) => i.className === intfName);
      if (intf) {
        for (const m of intf.methods) {
          interfaceMethods.push({
            ...m,
            entityKey: key,
            className,
          });
        }
      }
    }

    entities.push({
      key,
      className,
      isAbstract: n.category === "Class" ? !!n.isAbstract : false,
      isParent,
      parentClassName,
      parentKey,
      pk,
      scalars,
      relations,
      methods: [...(collected.byEntityKey.get(key) ?? []), ...interfaceMethods],
      implementedInterfaces: implementedByClass.get(key) ?? [],
    });
  }

  return { packageName, appName, entities, enums, interfaces, fkChoices, skipped, warnings };
}

/** Default determinista e independiente de la dirección del link: gana el nombre mayor. */
function defaultAlphabeticalOwner(fromKey: string, toKey: string, names: Map<string, string>): string {
  const a = names.get(fromKey) ?? fromKey;
  const b = names.get(toKey) ?? toKey;
  return a.localeCompare(b, "es") >= 0 ? fromKey : toKey;
}
