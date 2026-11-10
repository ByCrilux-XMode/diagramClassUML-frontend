/**
 * Diff determinístico entre el diagrama actual y el que devolvió el modelo.
 *
 * El modelo devuelve el diagrama completo; aquí se calcula qué cambió y se
 * agrupa en acciones que luego `toToolCalls` traduce a las tools del editor.
 *
 * Regla de seguridad: si la instrucción de la persona no pide eliminar,
 * reemplazar o quitar algo, el diff nunca borra entidades, relaciones ni
 * miembros. Los cambios que impliquen borrado se omiten con una advertencia.
 */
import type {
  CampoCanonico,
  DiagramaCanonico,
  EntidadCanonica,
  MetodoCanonico,
  ParametroCanonico,
  RelacionCanonica,
} from "./canonical";
import { normalizarNombre } from "./canonical";
import type { Proyeccion } from "./project";

export interface OpcionesDiff {
  /** `true` solo si la instrucción pidió eliminar/reemplazar explícitamente. */
  permitirBorrado: boolean;
}

export interface EntidadNueva {
  key: string;
  entidad: EntidadCanonica;
  /** Atributos que `addClass` no puede representar y requieren un update. */
  atributosExtra: CampoCanonico[];
}

export interface EntidadActualizada {
  realKey: string;
  actual: EntidadCanonica;
  deseado: EntidadCanonica;
  fusionada: EntidadCanonica;
  /** `class` ↔ `abstract` se aplica con `updateClass.isAbstract`. */
  cambiaAbstracto?: boolean;
}

export interface EntidadEliminada {
  realKey: string;
  entidad: EntidadCanonica;
}

export interface RelacionNueva {
  id: string;
  relacion: RelacionCanonica;
  fromKey: string;
  toKey: string;
}

export interface RelacionActualizada {
  linkKey: string;
  actual: RelacionCanonica;
  deseado: RelacionCanonica;
  fusionada: RelacionCanonica;
}

export interface RelacionEliminada {
  linkKey: string;
  relacion: RelacionCanonica;
}

export interface AtributoCambio {
  realKey: string;
  campo: CampoCanonico;
}

export interface MetodoCambio {
  realKey: string;
  metodo: MetodoCanonico;
}

export interface ResultadoDiff {
  agregarEntidades: EntidadNueva[];
  actualizarEntidades: EntidadActualizada[];
  eliminarEntidades: EntidadEliminada[];
  agregarAtributos: AtributoCambio[];
  actualizarAtributos: AtributoCambio[];
  eliminarAtributos: AtributoCambio[];
  agregarMetodos: MetodoCambio[];
  actualizarMetodos: MetodoCambio[];
  eliminarMetodos: MetodoCambio[];
  agregarRelaciones: RelacionNueva[];
  actualizarRelaciones: RelacionActualizada[];
  eliminarRelaciones: RelacionEliminada[];
  /** id deseado → clave real (para resolver extremos de relaciones). */
  mapaIds: Map<string, string>;
  advertencias: string[];
}

function textoNormalizado(valor: string | undefined): string {
  return (valor ?? "").trim();
}

function mismoTexto(a: string | undefined, b: string | undefined): boolean {
  return textoNormalizado(a) === textoNormalizado(b);
}

function mismaVisibilidad(a: CampoCanonico["visibilidad"], b: CampoCanonico["visibilidad"]): boolean {
  return (a ?? "public") === (b ?? "public");
}

function mismosParametros(a: ParametroCanonico[] | undefined, b: ParametroCanonico[] | undefined): boolean {
  const listaA = a ?? [];
  const listaB = b ?? [];
  if (listaA.length !== listaB.length) return false;
  return listaA.every((parametro, indice) => {
    const otro = listaB[indice];
    return (
      normalizarNombre(parametro.nombre) === normalizarNombre(otro.nombre) &&
      mismoTexto(parametro.tipo, otro.tipo) &&
      (parametro.direccion ?? "in") === (otro.direccion ?? "in")
    );
  });
}

function fusionarCampo(deseado: CampoCanonico, actual: CampoCanonico | undefined): CampoCanonico {
  if (!actual) return { ...deseado };
  return {
    nombre: deseado.nombre,
    visibilidad: deseado.visibilidad ?? actual.visibilidad,
    tipo: deseado.tipo !== undefined ? deseado.tipo : actual.tipo,
    multiplicidad:
      deseado.multiplicidad !== undefined ? deseado.multiplicidad : actual.multiplicidad,
    valor: deseado.valor !== undefined ? deseado.valor : actual.valor,
    estatico: deseado.estatico ?? actual.estatico,
    readonly: deseado.readonly ?? actual.readonly,
    derivado: deseado.derivado ?? actual.derivado,
  };
}

function camposIguales(a: CampoCanonico, b: CampoCanonico): boolean {
  return (
    normalizarNombre(a.nombre) === normalizarNombre(b.nombre) &&
    mismaVisibilidad(a.visibilidad, b.visibilidad) &&
    mismoTexto(a.tipo, b.tipo) &&
    mismoTexto(a.multiplicidad, b.multiplicidad) &&
    mismoTexto(a.valor, b.valor) &&
    (a.estatico === true) === (b.estatico === true) &&
    (a.readonly === true) === (b.readonly === true) &&
    (a.derivado === true) === (b.derivado === true)
  );
}

function fusionarMetodo(deseado: MetodoCanonico, actual: MetodoCanonico | undefined): MetodoCanonico {
  if (!actual) return { ...deseado };
  return {
    nombre: deseado.nombre,
    visibilidad: deseado.visibilidad ?? actual.visibilidad,
    parametros: deseado.parametros !== undefined ? deseado.parametros : actual.parametros,
    retorno: deseado.retorno !== undefined ? deseado.retorno : actual.retorno,
    multiplicidad:
      deseado.multiplicidad !== undefined ? deseado.multiplicidad : actual.multiplicidad,
    estatico: deseado.estatico ?? actual.estatico,
    abstracto: deseado.abstracto ?? actual.abstracto,
  };
}

/**
 * `updateMethod` no puede conservar multiplicidad, static ni abstract: solo se
 * comparan los campos que la tool sí aplica.
 */
function metodosIguales(a: MetodoCanonico, b: MetodoCanonico): boolean {
  return (
    normalizarNombre(a.nombre) === normalizarNombre(b.nombre) &&
    mismaVisibilidad(a.visibilidad, b.visibilidad) &&
    mismosParametros(a.parametros, b.parametros) &&
    mismoTexto(a.retorno, b.retorno)
  );
}

function fusionarRelacion(
  deseado: RelacionCanonica,
  actual: RelacionCanonica | undefined,
): RelacionCanonica {
  if (!actual) return { ...deseado };
  return {
    id: deseado.id,
    origen: deseado.origen,
    destino: deseado.destino,
    tipo: deseado.tipoExplicito === false ? actual.tipo : deseado.tipo,
    origenMult:
      deseado.origenMult !== undefined ? deseado.origenMult : actual.origenMult,
    destinoMult:
      deseado.destinoMult !== undefined ? deseado.destinoMult : actual.destinoMult,
    etiqueta: deseado.etiqueta !== undefined ? deseado.etiqueta : actual.etiqueta,
  };
}

function relacionesIguales(a: RelacionCanonica, b: RelacionCanonica): boolean {
  return (
    a.tipo === b.tipo &&
    mismoTexto(a.origenMult, b.origenMult) &&
    mismoTexto(a.destinoMult, b.destinoMult) &&
    mismoTexto(a.etiqueta, b.etiqueta)
  );
}

function slug(texto: string): string {
  const base = normalizarNombre(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "clase";
}

function claveUnica(texto: string, usadas: Set<string>): string {
  const base = slug(texto);
  if (!usadas.has(base)) return base;
  let indice = 2;
  while (usadas.has(`${base}_${indice}`)) indice += 1;
  return `${base}_${indice}`;
}

function indicePorNombre<T extends { nombre: string }>(lista: T[]): Map<string, number> {
  const mapa = new Map<string, number>();
  lista.forEach((elemento, indice) => {
    const clave = normalizarNombre(elemento.nombre);
    if (!mapa.has(clave)) mapa.set(clave, indice);
  });
  return mapa;
}

function clavesDeRelacion(proyeccion: Proyeccion, relacion: RelacionCanonica): {
  fromKey: string;
  toKey: string;
} | null {
  const fromKey = proyeccion.idMap.get(relacion.origen);
  const toKey = proyeccion.idMap.get(relacion.destino);
  if (!fromKey || !toKey) return null;
  return { fromKey, toKey };
}

/**
 * Calcula el diff entre el diagrama actual y el deseado.
 */
export function diffDiagrama(
  proyeccion: Proyeccion,
  deseado: DiagramaCanonico,
  opciones: OpcionesDiff,
): ResultadoDiff {
  const advertencias: string[] = [...proyeccion.advertencias];
  const resultado: ResultadoDiff = {
    agregarEntidades: [],
    actualizarEntidades: [],
    eliminarEntidades: [],
    agregarAtributos: [],
    actualizarAtributos: [],
    eliminarAtributos: [],
    agregarMetodos: [],
    actualizarMetodos: [],
    eliminarMetodos: [],
    agregarRelaciones: [],
    actualizarRelaciones: [],
    eliminarRelaciones: [],
    mapaIds: new Map(proyeccion.idMap),
    advertencias,
  };

  const usadas = new Set<string>(
    [...proyeccion.realKeyToEntity.keys()].map((key) => key.toLowerCase()),
  );
  const realKeyPorMinuscula = new Map<string, string>();
  for (const realKey of proyeccion.realKeyToEntity.keys()) {
    realKeyPorMinuscula.set(realKey.toLowerCase(), realKey);
  }
  const actualesPorNombre = new Map<string, string>();
  for (const [realKey, entidad] of proyeccion.realKeyToEntity) {
    actualesPorNombre.set(normalizarNombre(entidad.nombre), realKey);
  }

  const emparejadas = new Set<string>();
  const actualPorDeseada = new Map<string, EntidadCanonica>();

  // 1) Emparejar entidades deseadas con las actuales.
  for (const entidadDeseada of deseado.entidades) {
    let realKey: string | undefined;

    if (entidadDeseada.idImplicito !== true) {
      if (proyeccion.idMap.has(entidadDeseada.id)) {
        realKey = proyeccion.idMap.get(entidadDeseada.id);
      } else if (proyeccion.keyToId.has(entidadDeseada.id)) {
        realKey = entidadDeseada.id;
      } else if (realKeyPorMinuscula.has(entidadDeseada.id.toLowerCase())) {
        realKey = realKeyPorMinuscula.get(entidadDeseada.id.toLowerCase());
      }
    }
    if (!realKey) {
      const porNombre = actualesPorNombre.get(normalizarNombre(entidadDeseada.nombre));
      if (porNombre) realKey = porNombre;
    }

    if (realKey && emparejadas.has(realKey)) {
      realKey = undefined;
    }

    if (realKey) {
      const actual = proyeccion.realKeyToEntity.get(realKey);
      if (!actual) {
        realKey = undefined;
      } else {
        emparejadas.add(realKey);
        actualPorDeseada.set(entidadDeseada.id, actual);
        resultado.mapaIds.set(entidadDeseada.id, realKey);
      }
    }

    if (!realKey) {
      const key = claveUnica(entidadDeseada.nombre, usadas);
      usadas.add(key.toLowerCase());
      resultado.mapaIds.set(entidadDeseada.id, key);
      const atributosExtra = (entidadDeseada.atributos ?? []).filter(
        (campo) =>
          campo.multiplicidad !== undefined ||
          campo.valor !== undefined ||
          campo.estatico === true ||
          campo.readonly === true ||
          campo.derivado === true,
      );
      resultado.agregarEntidades.push({
        key,
        entidad: entidadDeseada,
        atributosExtra,
      });
    }
  }

  // 2) Comparar entidades emparejadas.
  for (const entidadDeseada of deseado.entidades) {
    const actual = actualPorDeseada.get(entidadDeseada.id);
    if (!actual) continue;
    const realKey = resultado.mapaIds.get(entidadDeseada.id);
    if (!realKey) continue;

    if (entidadDeseada.tipo !== actual.tipo && entidadDeseada.tipoExplicito !== false && !mismoEjeClase(actual.tipo, entidadDeseada.tipo)) {
      advertencias.push(
        `Cambio de categoría ignorado en '${actual.nombre}' (${actual.tipo} → ${entidadDeseada.tipo}): ` +
          "el editor no puede cambiar la categoría sin recrear la clase y perder su posición.",
      );
      continue;
    }

    const tipoDeseado = entidadDeseada.tipoExplicito === false ? actual.tipo : entidadDeseada.tipo;
    const cambiaAbstracto = tipoDeseado !== actual.tipo;
    if (cambiaAbstracto && !mismoEjeClase(actual.tipo, tipoDeseado)) {
      advertencias.push(
        `Cambio de categoría ignorado en '${actual.nombre}' (${actual.tipo} → ${tipoDeseado}).`,
      );
      continue;
    }

    const fusionada: EntidadCanonica = {
      ...actual,
      ...entidadDeseada,
      id: actual.id,
      tipo: actual.tipo,
      nombre: entidadDeseada.nombre,
    };

    const cambiaNombre = entidadDeseada.nombre !== actual.nombre;
    const literalesDifieren =
      actual.tipo === "enumeration" &&
      entidadDeseada.literalesOmitidos !== true &&
      !mismosLiterales(actual.literales, entidadDeseada.literales);
    const puedeAplicarLiterales =
      opciones.permitirBorrado ||
      literalesSoloAgrega(actual.literales, entidadDeseada.literales);
    if (literalesDifieren && !puedeAplicarLiterales) {
      advertencias.push(
        `Literales de '${actual.nombre}' no se modificaron: quitar literales requiere pedirlo explícitamente.`,
      );
    }
    const cambiaLiterales = literalesDifieren && puedeAplicarLiterales;

    if (cambiaNombre || cambiaLiterales || cambiaAbstracto) {
      resultado.actualizarEntidades.push({
        realKey,
        actual,
        deseado: { ...entidadDeseada, tipo: tipoDeseado },
        fusionada,
        ...(cambiaAbstracto ? { cambiaAbstracto: true } : {}),
      });
    }

    // Atributos: si el modelo omitió la clave, se conservan los actuales.
    if (entidadDeseada.atributosOmitidos !== true) {
      const actuales = actual.atributos ?? [];
      const deseados = entidadDeseada.atributos ?? [];
      const indicesActuales = indicePorNombre(actuales);

      for (const campoDeseado of deseados) {
        const indice = indicesActuales.get(normalizarNombre(campoDeseado.nombre));
        if (indice === undefined) {
          resultado.agregarAtributos.push({ realKey, campo: campoDeseado });
          continue;
        }
        const fusionado = fusionarCampo(campoDeseado, actuales[indice]);
        if (!camposIguales(actuales[indice], fusionado)) {
          resultado.actualizarAtributos.push({ realKey, campo: fusionado });
        }
      }

      if (opciones.permitirBorrado) {
        const nombresDeseados = new Set(deseados.map((campo) => normalizarNombre(campo.nombre)));
        for (const campoActual of actuales) {
          if (!nombresDeseados.has(normalizarNombre(campoActual.nombre))) {
            resultado.eliminarAtributos.push({ realKey, campo: campoActual });
          }
        }
      } else {
        const nombresDeseados = new Set(deseados.map((campo) => normalizarNombre(campo.nombre)));
        for (const campoActual of actuales) {
          if (!nombresDeseados.has(normalizarNombre(campoActual.nombre))) {
            advertencias.push(
              `Atributo '${campoActual.nombre}' de '${actual.nombre}' no se eliminó: la instrucción no lo pidió.`,
            );
          }
        }
      }
    }

    // Métodos: misma regla de conservación si la clave no vino.
    if (entidadDeseada.metodosOmitidos !== true) {
      const metodosActuales = actual.metodos ?? [];
      const metodosDeseados = entidadDeseada.metodos ?? [];
      const indicesMetodos = indicePorNombre(metodosActuales);

      for (const metodoDeseado of metodosDeseados) {
        const indice = indicesMetodos.get(normalizarNombre(metodoDeseado.nombre));
        if (indice === undefined) {
          resultado.agregarMetodos.push({ realKey, metodo: metodoDeseado });
          continue;
        }
        const fusionado = fusionarMetodo(metodoDeseado, metodosActuales[indice]);
        if (!metodosIguales(metodosActuales[indice], fusionado)) {
          resultado.actualizarMetodos.push({ realKey, metodo: fusionado });
        }
      }

      if (opciones.permitirBorrado) {
        const nombresDeseados = new Set(metodosDeseados.map((metodo) => normalizarNombre(metodo.nombre)));
        for (const metodoActual of metodosActuales) {
          if (!nombresDeseados.has(normalizarNombre(metodoActual.nombre))) {
            resultado.eliminarMetodos.push({ realKey, metodo: metodoActual });
          }
        }
      } else {
        const nombresDeseados = new Set(metodosDeseados.map((metodo) => normalizarNombre(metodo.nombre)));
        for (const metodoActual of metodosActuales) {
          if (!nombresDeseados.has(normalizarNombre(metodoActual.nombre))) {
            advertencias.push(
              `Método '${metodoActual.nombre}' de '${actual.nombre}' no se eliminó: la instrucción no lo pidió.`,
            );
          }
        }
      }
    }
  }

  // 3) Entidades actuales que ya no aparecen.
  for (const [realKey, entidad] of proyeccion.realKeyToEntity) {
    if (emparejadas.has(realKey)) continue;
    if (opciones.permitirBorrado) {
      resultado.eliminarEntidades.push({ realKey, entidad });
    } else {
      advertencias.push(
        `La clase '${entidad.nombre}' no se eliminó: la instrucción no lo pidió.`,
      );
    }
  }

  const entidadesEliminadas = new Set(resultado.eliminarEntidades.map((item) => item.realKey));

  // 4) Relaciones.
  const relacionActualPorLinkKey = new Map<string, RelacionCanonica>();
  for (const [linkKey, relacion] of proyeccion.realLinkKeyToRelation) {
    relacionActualPorLinkKey.set(linkKey, relacion);
  }
  const usadasRelacion = new Set<string>();

  for (const relacionDeseada of deseado.relaciones) {
    const fromKey = resultado.mapaIds.get(relacionDeseada.origen);
    const toKey = resultado.mapaIds.get(relacionDeseada.destino);
    if (!fromKey || !toKey) {
      advertencias.push(
        `Relación '${relacionDeseada.id}' ignorada: referencia una entidad desconocida.`,
      );
      continue;
    }
    if (entidadesEliminadas.has(fromKey) || entidadesEliminadas.has(toKey)) {
      continue;
    }

    let linkKey =
      relacionDeseada.idImplicito === true
        ? undefined
        : (proyeccion.relIdMap.get(relacionDeseada.id) ??
          (proyeccion.linkKeyToId.has(relacionDeseada.id) ? relacionDeseada.id : undefined));

    if (!linkKey || usadasRelacion.has(linkKey)) {
      linkKey = undefined;
      for (const [candidato, relacionActual] of relacionActualPorLinkKey) {
        if (usadasRelacion.has(candidato)) continue;
        const extremos = clavesDeRelacion(proyeccion, relacionActual);
        if (!extremos) continue;
        if (
          extremos.fromKey === fromKey &&
          extremos.toKey === toKey &&
          (relacionDeseada.tipoExplicito === false ||
            relacionActual.tipo === relacionDeseada.tipo)
        ) {
          linkKey = candidato;
          break;
        }
      }
    }

    if (!linkKey) {
      linkKey = undefined;
      for (const [candidato, relacionActual] of relacionActualPorLinkKey) {
        if (usadasRelacion.has(candidato)) continue;
        const extremos = clavesDeRelacion(proyeccion, relacionActual);
        if (!extremos) continue;
        if (extremos.fromKey === fromKey && extremos.toKey === toKey) {
          linkKey = candidato;
          break;
        }
      }
    }

    if (!linkKey) {
      resultado.agregarRelaciones.push({
        id: relacionDeseada.id,
        relacion: relacionDeseada,
        fromKey,
        toKey,
      });
      continue;
    }

    const actual = relacionActualPorLinkKey.get(linkKey);
    if (!actual) {
      resultado.agregarRelaciones.push({
        id: relacionDeseada.id,
        relacion: relacionDeseada,
        fromKey,
        toKey,
      });
      continue;
    }

    usadasRelacion.add(linkKey);
    const extremosActuales = clavesDeRelacion(proyeccion, actual);
    const cambianExtremos =
      !extremosActuales ||
      extremosActuales.fromKey !== fromKey ||
      extremosActuales.toKey !== toKey;

    if (cambianExtremos) {
      if (opciones.permitirBorrado) {
        resultado.eliminarRelaciones.push({ linkKey, relacion: actual });
        resultado.agregarRelaciones.push({
          id: relacionDeseada.id,
          relacion: relacionDeseada,
          fromKey,
          toKey,
        });
      } else {
        advertencias.push(
          `La relación '${relacionDeseada.id}' no se reconectó: la instrucción no pidió reemplazarla.`,
        );
      }
      continue;
    }

    const fusionada = fusionarRelacion(relacionDeseada, actual);
    if (!relacionesIguales(actual, fusionada)) {
      resultado.actualizarRelaciones.push({
        linkKey,
        actual,
        deseado: relacionDeseada,
        fusionada,
      });
    }
  }

  for (const [linkKey, relacion] of proyeccion.realLinkKeyToRelation) {
    if (usadasRelacion.has(linkKey)) continue;
    const extremos = clavesDeRelacion(proyeccion, relacion);
    if (extremos && (entidadesEliminadas.has(extremos.fromKey) || entidadesEliminadas.has(extremos.toKey))) {
      continue;
    }
    if (opciones.permitirBorrado) {
      resultado.eliminarRelaciones.push({ linkKey, relacion });
    } else {
      advertencias.push(
        `La relación '${relacion.id}' no se eliminó: la instrucción no lo pidió.`,
      );
    }
  }

  return resultado;
}

/** `class` ↔ `abstract` puede aplicarse con `updateClass.isAbstract`. */
function mismoEjeClase(a: EntidadCanonica["tipo"], b: EntidadCanonica["tipo"]): boolean {
  return (
    (a === "class" || a === "abstract") &&
    (b === "class" || b === "abstract")
  );
}

function mismosLiterales(a: string[] | undefined, b: string[] | undefined): boolean {
  const listaA = a ?? [];
  const listaB = b ?? [];
  if (listaA.length !== listaB.length) return false;
  return listaA.every((literal, indice) => literal === listaB[indice]);
}

/** `true` si el deseado conserva todos los literales actuales (solo agrega). */
function literalesSoloAgrega(a: string[] | undefined, b: string[] | undefined): boolean {
  const deseados = new Set(b ?? []);
  return (a ?? []).every((literal) => deseados.has(literal));
}
