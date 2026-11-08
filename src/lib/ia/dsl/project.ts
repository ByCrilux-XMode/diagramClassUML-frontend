/**
 * Proyección del estado del diagrama al DSL canónico.
 *
 * El snapshot que llega en el system prompt usa strings formateados para los
 * miembros (`+ total: double [1]`). Aquí se parsean a la estructura canónica
 * para que el modelo reciba un contrato estable y para que el diff pueda
 * comparar campo a campo.
 *
 * No importa GoJS ni las tools: es puro y se puede testear en Node.
 */
import type { DiagramState } from "@/lib/editorTools";
import type {
  CampoCanonico,
  DiagramaCanonico,
  EntidadCanonica,
  EntidadTipo,
  MetodoCanonico,
  ParametroCanonico,
  RelacionCanonica,
  TipoRelacion,
  Visibilidad,
} from "./canonical";
import {
  normalizarTipoRelacion,
  simboloVisibilidad,
  visibilidadDesdeSimbolo,
} from "./canonical";

/** Resultado de proyectar el snapshot. */
export interface Proyeccion {
  diagrama: DiagramaCanonico;
  /** id canónico de entidad (`n1`) → clave real de la clase. */
  idMap: Map<string, string>;
  /** id canónico de relación (`e1`) → clave real del enlace. */
  relIdMap: Map<string, string>;
  /** clave real de la clase → id canónico. */
  keyToId: Map<string, string>;
  /** clave real del enlace → id canónico. */
  linkKeyToId: Map<string, string>;
  /** clave real → entidad canónica actual. */
  realKeyToEntity: Map<string, EntidadCanonica>;
  /** clave real del enlace → relación canónica actual. */
  realLinkKeyToRelation: Map<string, RelacionCanonica>;
  /** Miembros que no se pudieron parsear; se conservan sin tocar. */
  advertencias: string[];
}

/** Busca un carácter de separación en el nivel 0 de anidamiento. */
function buscarTopLevel(texto: string, buscado: string): number {
  let profundidad = 0;
  let enCadena = false;
  let escapado = false;
  for (let i = 0; i < texto.length; i += 1) {
    const caracter = texto[i];
    if (enCadena) {
      if (escapado) escapado = false;
      else if (caracter === "\\") escapado = true;
      else if (caracter === '"') enCadena = false;
      continue;
    }
    if (caracter === '"') {
      enCadena = true;
      continue;
    }
    if (caracter === "<" || caracter === "[" || caracter === "(" || caracter === "{") {
      profundidad += 1;
    } else if (
      caracter === ">" ||
      caracter === "]" ||
      caracter === ")" ||
      caracter === "}"
    ) {
      profundidad = Math.max(0, profundidad - 1);
    } else if (profundidad === 0 && caracter === buscado) {
      return i;
    }
  }
  return -1;
}

/** Divide por un separador solo en el nivel 0 de anidamiento. */
function dividirTopLevel(texto: string, separador: string): string[] {
  const partes: string[] = [];
  let resto = texto;
  let indice = buscarTopLevel(resto, separador);
  while (indice !== -1) {
    partes.push(resto.slice(0, indice));
    resto = resto.slice(indice + 1);
    indice = buscarTopLevel(resto, separador);
  }
  partes.push(resto);
  return partes;
}

/** Encuentra el cierre que corresponde a un paréntesis/corchete/llave. */
function encontrarCierre(
  texto: string,
  inicio: number,
  abre: string,
  cierra: string,
): number {
  let profundidad = 0;
  let enCadena = false;
  let escapado = false;
  for (let i = inicio; i < texto.length; i += 1) {
    const caracter = texto[i];
    if (enCadena) {
      if (escapado) escapado = false;
      else if (caracter === "\\") escapado = true;
      else if (caracter === '"') enCadena = false;
      continue;
    }
    if (caracter === '"') enCadena = true;
    else if (caracter === abre) profundidad += 1;
    else if (caracter === cierra) {
      profundidad -= 1;
      if (profundidad === 0) return i;
    }
  }
  return -1;
}

/** Parsea una línea de atributo formateada por `formatAttribute`. */
export function parseAtributo(raw: string): CampoCanonico | null {
  const original = String(raw ?? "").trim();
  if (original === "") return null;

  let visibilidad: Visibilidad = "public";
  let resto = original;
  const conSimbolo = /^([+\-#~])\s+(.+)$/u.exec(original);
  if (conSimbolo) {
    visibilidad = visibilidadDesdeSimbolo(conSimbolo[1]);
    resto = conSimbolo[2].trim();
  }

  let derivado = false;
  if (resto.startsWith("/")) {
    derivado = true;
    resto = resto.slice(1).trim();
  }

  let readonly = false;
  const props = /\s*\{([^}]*)\}\s*$/u.exec(resto);
  if (props) {
    readonly = props[1]
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .includes("readonly");
    resto = resto.slice(0, props.index).trim();
  }

  let valor: string | undefined;
  const igual = buscarTopLevel(resto, "=");
  if (igual !== -1) {
    valor = resto.slice(igual + 1).trim() || undefined;
    resto = resto.slice(0, igual).trim();
  }

  let multiplicidad: string | undefined;
  const mult = /\s+\[([^\]]+)\]\s*$/u.exec(resto);
  if (mult) {
    multiplicidad = mult[1].trim() || undefined;
    resto = resto.slice(0, mult.index).trim();
  }

  const dosPuntos = resto.indexOf(":");
  let nombre = resto;
  let tipo: string | undefined;
  if (dosPuntos !== -1) {
    nombre = resto.slice(0, dosPuntos).trim();
    tipo = resto.slice(dosPuntos + 1).trim() || undefined;
  }
  if (nombre === "") return null;

  return {
    visibilidad,
    nombre,
    ...(tipo ? { tipo } : {}),
    ...(multiplicidad ? { multiplicidad } : {}),
    ...(valor ? { valor } : {}),
    ...(derivado ? { derivado: true } : {}),
    ...(readonly ? { readonly: true } : {}),
  };
}

/** Formatea un atributo canónico igual que `formatAttribute` del editor. */
export function formatearAtributo(campo: CampoCanonico): string {
  const vis = simboloVisibilidad(campo.visibilidad);
  const nombre = campo.derivado ? `/${campo.nombre}` : campo.nombre;
  const tipo = campo.tipo ? `: ${campo.tipo}` : "";
  const multiplicidad = campo.multiplicidad ? ` [${campo.multiplicidad}]` : "";
  const valor = campo.valor ? ` = ${campo.valor}` : "";
  const props = campo.readonly ? " {readOnly}" : "";
  return `${vis} ${nombre}${tipo}${multiplicidad}${valor}${props}`;
}

/** Parsea un parámetro formateado por `formatParameter`. */
export function parseParametro(raw: string): ParametroCanonico | null {
  const original = String(raw ?? "").trim();
  if (original === "") return null;

  let valor: string | undefined;
  const igual = buscarTopLevel(original, "=");
  let resto = original;
  if (igual !== -1) {
    valor = original.slice(igual + 1).trim() || undefined;
    resto = original.slice(0, igual).trim();
  }

  const dosPuntos = buscarTopLevel(resto, ":");
  let antes = resto;
  let tipo = "";
  if (dosPuntos !== -1) {
    antes = resto.slice(0, dosPuntos).trim();
    tipo = resto.slice(dosPuntos + 1).trim();
  }

  const partes = antes.split(/\s+/u).filter(Boolean);
  let direccion: ParametroCanonico["direccion"];
  let nombre = antes;
  if (partes.length >= 2) {
    const posible = partes[0].toLowerCase();
    if (posible === "in" || posible === "out" || posible === "inout") {
      direccion = posible;
      nombre = partes.slice(1).join(" ");
    }
  }
  if (nombre === "") return null;

  return {
    nombre,
    tipo: tipo || "",
    ...(direccion ? { direccion } : {}),
    ...(valor ? { valor } : {}),
  };
}

/** Formatea un parámetro canónico igual que `formatParameter`. */
export function formatearParametro(parametro: ParametroCanonico): string {
  const direccion =
    parametro.direccion && parametro.direccion !== "in"
      ? `${parametro.direccion} `
      : "";
  const valor = parametro.valor ? ` = ${parametro.valor}` : "";
  return `${direccion}${parametro.nombre}: ${parametro.tipo}${valor}`;
}

/** Parsea una línea de método formateada por `formatMethod`. */
export function parseMetodo(raw: string): MetodoCanonico | null {
  const original = String(raw ?? "").trim();
  if (original === "") return null;

  let visibilidad: Visibilidad = "public";
  let resto = original;
  const conSimbolo = /^([+\-#~])\s+(.+)$/u.exec(original);
  if (conSimbolo) {
    visibilidad = visibilidadDesdeSimbolo(conSimbolo[1]);
    resto = conSimbolo[2].trim();
  }

  const abre = resto.indexOf("(");
  if (abre === -1) return { visibilidad, nombre: resto };
  const cierra = encontrarCierre(resto, abre, "(", ")");
  if (cierra === -1) return { visibilidad, nombre: resto.slice(0, abre).trim() };

  const nombre = resto.slice(0, abre).trim();
  if (nombre === "") return null;

  const parametros = dividirTopLevel(resto.slice(abre + 1, cierra), ",")
    .map(parseParametro)
    .filter((p): p is ParametroCanonico => p !== null);

  let despues = resto.slice(cierra + 1).trim();

  let multiplicidad: string | undefined;
  const mult = /\s+\[([^\]]+)\]\s*$/u.exec(despues);
  if (mult) {
    multiplicidad = mult[1].trim() || undefined;
    despues = despues.slice(0, mult.index).trim();
  }

  let retorno: string | undefined;
  if (despues.startsWith(":")) {
    retorno = despues.slice(1).trim() || undefined;
  }

  return {
    visibilidad,
    nombre,
    ...(parametros.length > 0 ? { parametros } : {}),
    ...(retorno ? { retorno } : {}),
    ...(multiplicidad ? { multiplicidad } : {}),
  };
}

/** Formatea un método canónico igual que `formatMethod` del editor. */
export function formatearMetodo(metodo: MetodoCanonico): string {
  const vis = simboloVisibilidad(metodo.visibilidad);
  const parametros = (metodo.parametros ?? []).map(formatearParametro).join(", ");
  const retorno = metodo.retorno ? `: ${metodo.retorno}` : "";
  const multiplicidad = metodo.multiplicidad ? ` [${metodo.multiplicidad}]` : "";
  return `${vis} ${metodo.nombre}(${parametros})${retorno}${multiplicidad}`;
}

/** Compara dos miembros ignorando diferencias de espacios. */
export function mismoMiembro(a: string, b: string): boolean {
  return normalizarEspacios(a) === normalizarEspacios(b);
}

function normalizarEspacios(texto: string): string {
  return String(texto ?? "").replace(/\s+/g, " ").trim();
}

function tipoEntidadDesdeCategoria(category: unknown, isAbstract: unknown): EntidadTipo {
  const texto = String(category ?? "").trim();
  if (texto === "Interface") return "interface";
  if (texto === "Enum") return "enumeration";
  if (isAbstract === true) return "abstract";
  return "class";
}

function tipoRelacionDesdeKind(kind: unknown): TipoRelacion {
  return normalizarTipoRelacion(kind) ?? "association";
}

/**
 * Proyecta un `DiagramState` al DSL canónico.
 * @param state - Snapshot del system prompt
 */
export function proyectarDiagrama(state: DiagramState): Proyeccion {
  const advertencias: string[] = [];
  const entidades: EntidadCanonica[] = [];
  const relaciones: RelacionCanonica[] = [];
  const idMap = new Map<string, string>();
  const relIdMap = new Map<string, string>();
  const keyToId = new Map<string, string>();
  const linkKeyToId = new Map<string, string>();
  const realKeyToEntity = new Map<string, EntidadCanonica>();
  const realLinkKeyToRelation = new Map<string, RelacionCanonica>();

  const clases = Array.isArray(state?.classes) ? state.classes : [];
  const links = Array.isArray(state?.links) ? state.links : [];

  for (const clase of clases) {
    const key = String(clase?.key ?? "").trim();
    if (key === "" || keyToId.has(key)) {
      if (key !== "") advertencias.push(`Clase duplicada ignorada: '${key}'.`);
      continue;
    }

    const id = `n${entidades.length + 1}`;
    const tipo = tipoEntidadDesdeCategoria(clase.category, clase.isAbstract);
    const entidad: EntidadCanonica = {
      id,
      tipo,
      nombre: String(clase.name ?? key).trim() || key,
    };

    if (tipo === "enumeration") {
      const literales = Array.isArray(clase.literals)
        ? clase.literals.filter((l): l is string => typeof l === "string")
        : [];
      if (literales.length > 0) entidad.literales = literales;
    } else {
      if (Array.isArray(clase.attributes)) {
        const atributos = clase.attributes
          .map((raw) => {
            const campo = parseAtributo(raw);
            if (!campo) advertencias.push(`Atributo no parseable en '${key}': ${raw}`);
            return campo;
          })
          .filter((campo): campo is CampoCanonico => campo !== null);
        if (atributos.length > 0) entidad.atributos = atributos;
      }
      if (Array.isArray(clase.methods)) {
        const metodos = clase.methods
          .map((raw) => {
            const metodo = parseMetodo(raw);
            if (!metodo) advertencias.push(`Método no parseable en '${key}': ${raw}`);
            return metodo;
          })
          .filter((metodo): metodo is MetodoCanonico => metodo !== null);
        if (metodos.length > 0) entidad.metodos = metodos;
      }
    }

    entidades.push(entidad);
    idMap.set(id, key);
    keyToId.set(key, id);
    realKeyToEntity.set(key, entidad);
  }

  for (const link of links) {
    const from = String(link?.from ?? "").trim();
    const to = String(link?.to ?? "").trim();
    const origenId = keyToId.get(from);
    const destinoId = keyToId.get(to);
    if (!origenId || !destinoId) {
      advertencias.push(
        `Relación ignorada: '${from}' → '${to}' referencia una clase inexistente.`,
      );
      continue;
    }

    const key = String(link?.key ?? `e_${relaciones.length + 1}`).trim();
    if (key === "" || linkKeyToId.has(key)) {
      advertencias.push(`Relación duplicada ignorada: '${key}'.`);
      continue;
    }

    const id = `e${relaciones.length + 1}`;
    const relacion: RelacionCanonica = {
      id,
      origen: origenId,
      destino: destinoId,
      tipo: tipoRelacionDesdeKind(link.kind),
      ...(link.fromMult ? { origenMult: String(link.fromMult) } : {}),
      ...(link.toMult ? { destinoMult: String(link.toMult) } : {}),
      ...(link.label ? { etiqueta: String(link.label) } : {}),
    };

    relaciones.push(relacion);
    relIdMap.set(id, key);
    linkKeyToId.set(key, id);
    realLinkKeyToRelation.set(key, relacion);
  }

  return {
    diagrama: { entidades, relaciones },
    idMap,
    relIdMap,
    keyToId,
    linkKeyToId,
    realKeyToEntity,
    realLinkKeyToRelation,
    advertencias,
  };
}
