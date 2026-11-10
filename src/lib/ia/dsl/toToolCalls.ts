/**
 * Traducción del diff a las tools reales del editor.
 *
 * El orden importa:
 *  1. metadatos de clases existentes,
 *  2. clases nuevas (y sus atributos con campos extra),
 *  3. altas/cambios de miembros,
 *  4. bajas de relaciones,
 *  5. cambios y altas de relaciones,
 *  6. bajas de miembros,
 *  7. bajas de clases al final.
 *
 * Las relaciones se eliminan antes que las clases para no depender de que
 * `removeClass` limpie los enlaces conectados.
 */
import type { IAToolCall } from "@/lib/ia/types";
import type { CampoCanonico, EntidadCanonica, MetodoCanonico, RelacionCanonica } from "./canonical";
import {
  categoriaEntidad,
  simboloVisibilidad,
  tipoRelacionFrontend,
} from "./canonical";
import type { AtributoCambio, MetodoCambio, ResultadoDiff } from "./diff";

function llamada(nombre: string, args: Record<string, unknown>, indice: number): IAToolCall {
  return {
    id: `dsl-${indice + 1}`,
    type: "function",
    function: { name: nombre, arguments: JSON.stringify(args) },
  };
}

function atributoHerramienta(campo: CampoCanonico): Record<string, unknown> {
  const args: Record<string, unknown> = {
    name: campo.nombre,
    visibility: simboloVisibilidad(campo.visibilidad),
  };
  if (campo.tipo !== undefined) args.type = campo.tipo;
  if (campo.multiplicidad !== undefined) args.multiplicity = campo.multiplicidad;
  if (campo.valor !== undefined) args.defaultValue = campo.valor;
  if (campo.estatico === true) args.isStatic = true;
  if (campo.readonly === true) args.isReadOnly = true;
  if (campo.derivado === true) args.isDerived = true;
  return args;
}

function atributoMinimo(campo: CampoCanonico): Record<string, unknown> {
  return {
    name: campo.nombre,
    ...(campo.tipo !== undefined ? { type: campo.tipo } : {}),
    visibility: simboloVisibilidad(campo.visibilidad),
  };
}

function metodoHerramienta(metodo: MetodoCanonico): Record<string, unknown> {
  return {
    name: metodo.nombre,
    visibility: simboloVisibilidad(metodo.visibilidad),
    ...(metodo.parametros && metodo.parametros.length > 0
      ? {
          parameters: metodo.parametros.map((parametro) => ({
            name: parametro.nombre,
            type: parametro.tipo,
            direction: parametro.direccion ?? "in",
          })),
        }
      : {}),
    ...(metodo.retorno !== undefined ? { returnType: metodo.retorno } : {}),
  };
}

function argsAddClass(entidad: EntidadCanonica, key: string): Record<string, unknown> {
  const { category, isAbstract } = categoriaEntidad(entidad.tipo);
  const args: Record<string, unknown> = {
    key,
    name: entidad.nombre,
    category,
  };
  if (isAbstract) args.isAbstract = true;

  if (entidad.tipo === "enumeration") {
    if (entidad.literales && entidad.literales.length > 0) {
      args.literals = entidad.literales;
    }
    return args;
  }

  if (entidad.tipo !== "interface" && entidad.atributos && entidad.atributos.length > 0) {
    args.attributes = entidad.atributos.map(atributoMinimo);
  }
  if (entidad.metodos && entidad.metodos.length > 0) {
    args.methods = entidad.metodos.map(metodoHerramienta);
  }
  return args;
}

function argsUpdateClass(
  realKey: string,
  actual: EntidadCanonica,
  deseado: EntidadCanonica,
): Record<string, unknown> {
  const args: Record<string, unknown> = { key: realKey };
  if (deseado.nombre !== actual.nombre) args.name = deseado.nombre;

  // `class` ↔ `abstract` es la única transición de categoría representable.
  if (deseado.tipo !== actual.tipo) {
    args.isAbstract = deseado.tipo === "abstract";
  }

  const literalesActuales = actual.literales ?? [];
  const literalesDeseados = deseado.literales ?? [];
  const cambianLiterales =
    actual.tipo === "enumeration" &&
    (literalesActuales.length !== literalesDeseados.length ||
      literalesActuales.some((literal, indice) => literal !== literalesDeseados[indice]));
  if (cambianLiterales) args.literals = literalesDeseados;

  return args;
}

function llamadaAtributo(
  accion: "add" | "remove" | "update",
  cambio: AtributoCambio,
  indice: number,
): IAToolCall {
  return llamada(
    "updateAttribute",
    {
      classKey: cambio.realKey,
      action: accion,
      attribute:
        accion === "remove"
          ? { name: cambio.campo.nombre }
          : atributoHerramienta(cambio.campo),
    },
    indice,
  );
}

function llamadaMetodo(
  accion: "add" | "remove" | "update",
  cambio: MetodoCambio,
  indice: number,
): IAToolCall {
  return llamada(
    "updateMethod",
    {
      classKey: cambio.realKey,
      action: accion,
      method:
        accion === "remove"
          ? { name: cambio.metodo.nombre }
          : metodoHerramienta(cambio.metodo),
    },
    indice,
  );
}

function argsConnect(
  relacion: RelacionCanonica,
  fromKey: string,
  toKey: string,
): Record<string, unknown> {
  const args: Record<string, unknown> = {
    from: fromKey,
    to: toKey,
    kind: tipoRelacionFrontend(relacion.tipo),
  };
  if (relacion.origenMult !== undefined) args.fromMult = relacion.origenMult;
  if (relacion.destinoMult !== undefined) args.toMult = relacion.destinoMult;
  if (relacion.etiqueta !== undefined) args.label = relacion.etiqueta;
  return args;
}

function argsUpdateRelacion(
  linkKey: string,
  fusionada: RelacionCanonica,
): Record<string, unknown> {
  return {
    linkKey,
    action: "update",
    kind: tipoRelacionFrontend(fusionada.tipo),
    ...(fusionada.origenMult !== undefined ? { fromMult: fusionada.origenMult } : {}),
    ...(fusionada.destinoMult !== undefined ? { toMult: fusionada.destinoMult } : {}),
    ...(fusionada.etiqueta !== undefined ? { label: fusionada.etiqueta } : {}),
  };
}

/**
 * Convierte el diff en llamadas a tools. Las llamadas se generan en orden
 * estable para que el mismo diagrama produzca siempre el mismo resultado.
 */
export function toToolCalls(diff: ResultadoDiff): IAToolCall[] {
  const calls: IAToolCall[] = [];
  const push = (nombre: string, args: Record<string, unknown>) => {
    calls.push(llamada(nombre, args, calls.length));
  };

  // 1) Metadatos de clases existentes.
  for (const cambio of diff.actualizarEntidades) {
    push(
      "updateClass",
      argsUpdateClass(cambio.realKey, cambio.actual, cambio.deseado),
    );
  }

  // 2) Clases nuevas.
  for (const nueva of diff.agregarEntidades) {
    push("addClass", argsAddClass(nueva.entidad, nueva.key));
  }

  // 2b) Atributos nuevos que `addClass` no puede representar.
  for (const nueva of diff.agregarEntidades) {
    for (const campo of nueva.atributosExtra) {
      push("updateAttribute", {
        classKey: nueva.key,
        action: "update",
        attribute: atributoHerramienta(campo),
      });
    }
  }

  // 3) Miembros.
  for (const cambio of diff.agregarAtributos) {
    calls.push(llamadaAtributo("add", cambio, calls.length));
  }
  for (const cambio of diff.actualizarAtributos) {
    calls.push(llamadaAtributo("update", cambio, calls.length));
  }
  for (const cambio of diff.agregarMetodos) {
    calls.push(llamadaMetodo("add", cambio, calls.length));
  }
  for (const cambio of diff.actualizarMetodos) {
    calls.push(llamadaMetodo("update", cambio, calls.length));
  }

  // 4) Bajas de relaciones.
  for (const eliminada of diff.eliminarRelaciones) {
    push("updateRelation", { linkKey: eliminada.linkKey, action: "remove" });
  }

  // 5) Cambios y altas de relaciones.
  for (const cambio of diff.actualizarRelaciones) {
    push("updateRelation", argsUpdateRelacion(cambio.linkKey, cambio.fusionada));
  }
  for (const nueva of diff.agregarRelaciones) {
    push("connect", argsConnect(nueva.relacion, nueva.fromKey, nueva.toKey));
  }

  // 6) Bajas de miembros.
  for (const cambio of diff.eliminarAtributos) {
    calls.push(llamadaAtributo("remove", cambio, calls.length));
  }
  for (const cambio of diff.eliminarMetodos) {
    calls.push(llamadaMetodo("remove", cambio, calls.length));
  }

  // 7) Bajas de clases.
  for (const eliminada of diff.eliminarEntidades) {
    push("removeClass", { key: eliminada.realKey });
  }

  return calls;
}
