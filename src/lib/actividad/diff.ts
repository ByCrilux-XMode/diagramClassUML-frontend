import type {
  AttributeData,
  MethodData,
} from "@/types/uml";
import type { ClaseSemantica, EstadoSemantico, RelacionSemantica } from "./estado";

export type AccionCambio = "crear" | "actualizar" | "eliminar";
export type EntidadTipo = "clase" | "relacion" | "atributo" | "metodo";

export interface CambioActividad {
  accion: AccionCambio;
  entidadTipo: EntidadTipo;
  entidadKey: string;
  campo?: string;
  antes?: unknown;
  despues?: unknown;
}

export interface ResultadoDiff {
  cambios: CambioActividad[];
  entidades: string[];
  tipo: string | null;
}

const CAMPOS_ATRIBUTO: Array<keyof AttributeData> = [
  "name",
  "type",
  "visibility",
  "multiplicity",
  "defaultValue",
  "isStatic",
  "isDerived",
  "isReadOnly",
];

const CAMPOS_METODO: Array<keyof MethodData> = [
  "name",
  "visibility",
  "returnType",
  "multiplicity",
  "isStatic",
  "isAbstract",
];

function igual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function claveAtributo(claseKey: string, nombre: string): string {
  return `${claseKey}.${nombre}`;
}

function claveMetodo(claseKey: string, nombre: string): string {
  return `${claseKey}.${nombre}()`;
}

function cambiosDeAtributos(
  claseKey: string,
  antes: AttributeData[],
  despues: AttributeData[],
): CambioActividad[] {
  const cambios: CambioActividad[] = [];
  const porNombreAntes = new Map(antes.map((atributo) => [atributo.name, atributo]));
  const porNombreDespues = new Map(despues.map((atributo) => [atributo.name, atributo]));

  for (const [nombre, atributo] of porNombreAntes) {
    if (!porNombreDespues.has(nombre)) {
      cambios.push({
        accion: "eliminar",
        entidadTipo: "atributo",
        entidadKey: claveAtributo(claseKey, nombre),
        antes: atributo,
      });
    }
  }

  for (const [nombre, atributo] of porNombreDespues) {
    const previo = porNombreAntes.get(nombre);
    if (!previo) {
      cambios.push({
        accion: "crear",
        entidadTipo: "atributo",
        entidadKey: claveAtributo(claseKey, nombre),
        despues: atributo,
      });
      continue;
    }
    for (const campo of CAMPOS_ATRIBUTO) {
      if (!igual(previo[campo], atributo[campo])) {
        cambios.push({
          accion: "actualizar",
          entidadTipo: "atributo",
          entidadKey: claveAtributo(claseKey, nombre),
          campo: String(campo),
          antes: previo[campo] ?? null,
          despues: atributo[campo] ?? null,
        });
      }
    }
  }

  return cambios;
}

function cambiosDeMetodos(
  claseKey: string,
  antes: MethodData[],
  despues: MethodData[],
): CambioActividad[] {
  const cambios: CambioActividad[] = [];
  const porNombreAntes = new Map(antes.map((metodo) => [metodo.name, metodo]));
  const porNombreDespues = new Map(despues.map((metodo) => [metodo.name, metodo]));

  for (const [nombre, metodo] of porNombreAntes) {
    if (!porNombreDespues.has(nombre)) {
      cambios.push({
        accion: "eliminar",
        entidadTipo: "metodo",
        entidadKey: claveMetodo(claseKey, nombre),
        antes: metodo,
      });
    }
  }

  for (const [nombre, metodo] of porNombreDespues) {
    const previo = porNombreAntes.get(nombre);
    if (!previo) {
      cambios.push({
        accion: "crear",
        entidadTipo: "metodo",
        entidadKey: claveMetodo(claseKey, nombre),
        despues: metodo,
      });
      continue;
    }
    for (const campo of CAMPOS_METODO) {
      if (!igual(previo[campo], metodo[campo])) {
        cambios.push({
          accion: "actualizar",
          entidadTipo: "metodo",
          entidadKey: claveMetodo(claseKey, nombre),
          campo: String(campo),
          antes: previo[campo] ?? null,
          despues: metodo[campo] ?? null,
        });
      }
    }
    if (!igual(previo.parameters ?? [], metodo.parameters ?? [])) {
      cambios.push({
        accion: "actualizar",
        entidadTipo: "metodo",
        entidadKey: claveMetodo(claseKey, nombre),
        campo: "parameters",
        antes: previo.parameters ?? [],
        despues: metodo.parameters ?? [],
      });
    }
  }

  return cambios;
}

function compararClase(antes: ClaseSemantica, despues: ClaseSemantica): CambioActividad[] {
  const cambios: CambioActividad[] = [];
  const base = { entidadTipo: "clase" as const, entidadKey: despues.key };

  if (antes.name !== despues.name) {
    cambios.push({ ...base, accion: "actualizar", campo: "name", antes: antes.name, despues: despues.name });
  }
  if (antes.category !== despues.category) {
    cambios.push({
      ...base,
      accion: "actualizar",
      campo: "category",
      antes: antes.category,
      despues: despues.category,
    });
  }
  if (Boolean(antes.isAbstract) !== Boolean(despues.isAbstract)) {
    cambios.push({
      ...base,
      accion: "actualizar",
      campo: "isAbstract",
      antes: Boolean(antes.isAbstract),
      despues: Boolean(despues.isAbstract),
    });
  }
  if (!igual(antes.literals ?? [], despues.literals ?? [])) {
    cambios.push({
      ...base,
      accion: "actualizar",
      campo: "literals",
      antes: antes.literals ?? [],
      despues: despues.literals ?? [],
    });
  }
  cambios.push(...cambiosDeAtributos(despues.key, antes.attributes ?? [], despues.attributes ?? []));
  cambios.push(...cambiosDeMetodos(despues.key, antes.methods ?? [], despues.methods ?? []));

  return cambios;
}

function compararRelacion(antes: RelacionSemantica, despues: RelacionSemantica): CambioActividad[] {
  const cambios: CambioActividad[] = [];
  const base = { entidadTipo: "relacion" as const, entidadKey: despues.key };
  const campos: Array<keyof RelacionSemantica> = [
    "fromMultiplicity",
    "toMultiplicity",
    "name",
    "from",
    "to",
    "category",
  ];
  for (const campo of campos) {
    if (!igual(antes[campo], despues[campo])) {
      cambios.push({
        ...base,
        accion: "actualizar",
        campo: String(campo),
        antes: antes[campo] ?? null,
        despues: despues[campo] ?? null,
      });
    }
  }
  return cambios;
}

function clasificar(cambios: CambioActividad[]): string | null {
  if (cambios.length === 0) return null;

  const tieneClase = cambios.some(
    (cambio) =>
      cambio.entidadTipo === "clase" ||
      cambio.entidadTipo === "atributo" ||
      cambio.entidadTipo === "metodo",
  );
  const tieneRelacion = cambios.some((cambio) => cambio.entidadTipo === "relacion");

  // Borrar una clase arrastra sus relaciones: es un solo hecho, no una mezcla.
  // La spec exige un único evento `clase.eliminar` con los tres cambios.
  if (cambios.every((cambio) => cambio.accion === "eliminar")) {
    return `${tieneClase ? "clase" : "relacion"}.eliminar`;
  }

  if (tieneClase && tieneRelacion) return "mixto";
  if (!tieneClase && !tieneRelacion) return "mixto";

  const raiz = tieneClase ? "clase" : "relacion";
  const acciones = new Set(
    cambios
      .filter((cambio) =>
        raiz === "clase"
          ? cambio.entidadTipo !== "relacion"
          : cambio.entidadTipo === "relacion",
      )
      .map((cambio) => cambio.accion),
  );

  if (acciones.size === 1) {
    const [accion] = acciones;
    if (accion === "crear") return `${raiz}.crear`;
    if (accion === "eliminar") return `${raiz}.eliminar`;
  }
  return `${raiz}.actualizar`;
}

function recolectarEntidades(cambios: CambioActividad[], estado: EstadoSemantico): string[] {
  const entidades = new Set<string>();
  for (const cambio of cambios) {
    entidades.add(cambio.entidadKey);
    if (cambio.entidadTipo === "relacion") {
      const relacion = estado.relaciones.get(cambio.entidadKey);
      if (relacion) {
        entidades.add(relacion.from);
        entidades.add(relacion.to);
      }
    }
    if (cambio.entidadTipo === "atributo" || cambio.entidadTipo === "metodo") {
      const punto = cambio.entidadKey.indexOf(".");
      if (punto > 0) entidades.add(cambio.entidadKey.slice(0, punto));
    }
  }
  return [...entidades];
}

/**
 * Compara dos estados semánticos y produce el contenido de un evento.
 *
 * El orden es estable: primero las eliminaciones (clase y luego sus relaciones),
 * después las creaciones y al final las actualizaciones. Así un borrado en
 * cascada se lee como un solo hecho.
 */
export function diffEstados(antes: EstadoSemantico, despues: EstadoSemantico): ResultadoDiff {
  const cambios: CambioActividad[] = [];

  for (const [key, clase] of antes.clases) {
    if (!despues.clases.has(key)) {
      cambios.push({
        accion: "eliminar",
        entidadTipo: "clase",
        entidadKey: key,
        antes: clase,
      });
    }
  }

  for (const [key, relacion] of antes.relaciones) {
    if (!despues.relaciones.has(key)) {
      cambios.push({
        accion: "eliminar",
        entidadTipo: "relacion",
        entidadKey: key,
        antes: relacion,
      });
    }
  }

  for (const [key, clase] of despues.clases) {
    if (!antes.clases.has(key)) {
      cambios.push({
        accion: "crear",
        entidadTipo: "clase",
        entidadKey: key,
        despues: clase,
      });
    }
  }

  for (const [key, relacion] of despues.relaciones) {
    if (!antes.relaciones.has(key)) {
      cambios.push({
        accion: "crear",
        entidadTipo: "relacion",
        entidadKey: key,
        despues: relacion,
      });
    }
  }

  for (const [key, clase] of despues.clases) {
    const previa = antes.clases.get(key);
    if (previa) cambios.push(...compararClase(previa, clase));
  }

  for (const [key, relacion] of despues.relaciones) {
    const previa = antes.relaciones.get(key);
    if (previa) cambios.push(...compararRelacion(previa, relacion));
  }

  return {
    cambios,
    entidades: recolectarEntidades(cambios, despues),
    tipo: clasificar(cambios),
  };
}
