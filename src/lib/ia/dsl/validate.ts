/**
 * Validación y normalización de la salida del modelo para el DSL canónico.
 *
 * El Space no impone un esquema: el modelo puede devolver alias en español o
 * inglés, miembros como string o como objeto, o relaciones referidas por
 * nombre en lugar de id. Aquí se acepta todo eso y se devuelve un
 * `SalidaModelo` limpio o un error legible para el reintento.
 */
import type {
  CampoCanonico,
  ConsultaCanonica,
  ConsultaHerramienta,
  DiagramaCanonico,
  EntidadCanonica,
  EntidadTipo,
  MetodoCanonico,
  ParametroCanonico,
  RelacionCanonica,
  SalidaModelo,
  SalidaTipo,
  TipoRelacion,
} from "./canonical";
import {
  CONSULTAS_PERMITIDAS,
  normalizarNombre,
  normalizarTipoEntidad,
  normalizarTipoRelacion,
  normalizarVisibilidad,
} from "./canonical";
import { parseAtributo, parseMetodo, parseParametro } from "./project";

export type ResultadoValidacion<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function texto(valor: unknown): string | undefined {
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  return undefined;
}

function booleano(valor: unknown): boolean | undefined {
  if (typeof valor === "boolean") return valor;
  if (valor === "true" || valor === "si" || valor === "sí" || valor === 1) return true;
  if (valor === "false" || valor === "no" || valor === 0) return false;
  return undefined;
}

function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : [];
}

/** Devuelve el primer valor definido entre varios alias. */
function primero(...valores: unknown[]): unknown {
  for (const valor of valores) {
    if (valor !== undefined && valor !== null) return valor;
  }
  return undefined;
}

function normalizarTipoSalida(valor: unknown, tieneDiagrama: boolean, tieneConsultas: boolean): SalidaTipo {
  const t = String(valor ?? "").trim().toLowerCase();
  if (t === "diagrama" || t === "diagram" || t === "edicion" || t === "edición" || t === "edit") {
    return "diagrama";
  }
  if (t === "consulta" || t === "query" || t === "lectura" || t === "read") return "consulta";
  if (t === "chat" || t === "texto" || t === "mensaje" || t === "text") return "chat";
  if (tieneDiagrama) return "diagrama";
  if (tieneConsultas) return "consulta";
  return "chat";
}

function normalizarCampo(valor: unknown): CampoCanonico | string {
  if (typeof valor === "string") return valor;
  if (!esObjeto(valor)) return "Atributo inválido: se esperaba un objeto o un string.";

  const nombre = texto(primero(valor.nombre, valor.name));
  if (!nombre) return "Atributo sin 'nombre'.";

  const visibilidadRaw = primero(valor.visibilidad, valor.visibility);
  const tipo = texto(primero(valor.tipo, valor.type));
  const multiplicidad = texto(primero(valor.multiplicidad, valor.multiplicity));
  const valorDefecto = texto(
    primero(valor.valor, valor.value, valor.defaultValue, valor.porDefecto),
  );
  const estatico = booleano(primero(valor.estatico, valor.static, valor.isStatic));
  const readonly = booleano(primero(valor.readonly, valor.readOnly, valor.isReadOnly));
  const derivado = booleano(primero(valor.derivado, valor.derived, valor.isDerived));

  const campo: CampoCanonico = { nombre };
  if (visibilidadRaw !== undefined) campo.visibilidad = normalizarVisibilidad(visibilidadRaw);
  if (tipo !== undefined && tipo !== "") campo.tipo = tipo;
  if (multiplicidad !== undefined) campo.multiplicidad = multiplicidad;
  if (valorDefecto !== undefined) campo.valor = valorDefecto;
  if (estatico === true) campo.estatico = true;
  if (readonly === true) campo.readonly = true;
  if (derivado === true) campo.derivado = true;
  return campo;
}

function normalizarParametro(valor: unknown): ParametroCanonico | string {
  if (typeof valor === "string") return valor;
  if (!esObjeto(valor)) return "Parámetro inválido: se esperaba un objeto o un string.";

  const nombre = texto(primero(valor.nombre, valor.name));
  if (!nombre) return "Parámetro sin 'nombre'.";
  const tipo = texto(primero(valor.tipo, valor.type)) ?? "";
  const direccionRaw = texto(primero(valor.direccion, valor.direction))?.toLowerCase();
  const valorDefecto = texto(
    primero(valor.valor, valor.value, valor.defaultValue, valor.porDefecto),
  );

  const parametro: ParametroCanonico = { nombre, tipo };
  if (direccionRaw === "in" || direccionRaw === "out" || direccionRaw === "inout") {
    parametro.direccion = direccionRaw;
  }
  if (valorDefecto !== undefined) parametro.valor = valorDefecto;
  return parametro;
}

function normalizarMetodo(valor: unknown): MetodoCanonico | string {
  if (typeof valor === "string") return valor;
  if (!esObjeto(valor)) return "Método inválido: se esperaba un objeto o un string.";

  const nombre = texto(primero(valor.nombre, valor.name));
  if (!nombre) return "Método sin 'nombre'.";

  const visibilidadRaw = primero(valor.visibilidad, valor.visibility);
  const parametrosRaw = primero(valor.parametros, valor.parameters, valor.params);
  const retorno = texto(
    primero(valor.retorno, valor.returnType, valor.return, valor.tipoRetorno),
  );
  const multiplicidad = texto(primero(valor.multiplicidad, valor.multiplicity));
  const estatico = booleano(primero(valor.estatico, valor.static, valor.isStatic));
  const abstracto = booleano(primero(valor.abstracto, valor.abstract, valor.isAbstract));

  const metodo: MetodoCanonico = { nombre };
  if (visibilidadRaw !== undefined) metodo.visibilidad = normalizarVisibilidad(visibilidadRaw);
  if (Array.isArray(parametrosRaw)) {
    const parametros: ParametroCanonico[] = [];
    for (const parametroRaw of parametrosRaw) {
      const resultado = normalizarParametro(parametroRaw);
      if (typeof resultado === "string") {
        const parseado = parseParametro(resultado);
        if (parseado) parametros.push(parseado);
      } else {
        parametros.push(resultado);
      }
    }
    if (parametros.length > 0) metodo.parametros = parametros;
  }
  if (retorno !== undefined) metodo.retorno = retorno;
  if (multiplicidad !== undefined) metodo.multiplicidad = multiplicidad;
  if (estatico === true) metodo.estatico = true;
  if (abstracto === true) metodo.abstracto = true;
  return metodo;
}

function normalizarEntidad(valor: unknown, indice: number): EntidadCanonica | string {
  if (!esObjeto(valor)) return `Entidad #${indice + 1} inválida: se esperaba un objeto.`;

  const idRaw = primero(valor.id, valor.key, valor.clave);
  const id = texto(idRaw) ?? `n${indice + 1}`;
  const idImplicito = texto(idRaw) === undefined;
  const nombre = texto(primero(valor.nombre, valor.name, valor.nombreClase));
  if (!nombre) return `Entidad '${id}' sin 'nombre'.`;

  const tipoRaw = primero(valor.tipo, valor.type, valor.category, valor.categoria);
  const abstractoRaw = booleano(primero(valor.esAbstracta, valor.isAbstract));
  const tipoNormalizado = normalizarTipoEntidad(tipoRaw);
  let tipo: EntidadTipo = tipoNormalizado ?? (abstractoRaw === true ? "abstract" : "class");
  if (tipo === "class" && abstractoRaw === true) {
    tipo = "abstract";
  }
  const tipoExplicito = tipoNormalizado !== null || abstractoRaw !== undefined;

  const entidad: EntidadCanonica = { id, tipo, nombre };
  if (idImplicito) entidad.idImplicito = true;
  if (!tipoExplicito) entidad.tipoExplicito = false;

  const atributosRaw = primero(valor.atributos, valor.attributes, valor.campos);
  if (Array.isArray(atributosRaw)) {
    const atributos: CampoCanonico[] = [];
    for (const atributoRaw of atributosRaw) {
      const resultado = normalizarCampo(atributoRaw);
      if (typeof resultado === "string") {
        const parseado = parseAtributo(resultado);
        if (parseado) atributos.push(parseado);
        else return `Entidad '${id}': ${resultado}`;
      } else {
        atributos.push(resultado);
      }
    }
    if (atributos.length > 0) entidad.atributos = atributos;
  } else {
    entidad.atributosOmitidos = true;
  }

  const metodosRaw = primero(valor.metodos, valor.methods, valor.operaciones);
  if (Array.isArray(metodosRaw)) {
    const metodos: MetodoCanonico[] = [];
    for (const metodoRaw of metodosRaw) {
      const resultado = normalizarMetodo(metodoRaw);
      if (typeof resultado === "string") {
        const parseado = parseMetodo(resultado);
        if (parseado) metodos.push(parseado);
        else return `Entidad '${id}': ${resultado}`;
      } else {
        metodos.push(resultado);
      }
    }
    if (metodos.length > 0) entidad.metodos = metodos;
  } else {
    entidad.metodosOmitidos = true;
  }

  const literalesRaw = primero(valor.literales, valor.literals);
  if (Array.isArray(literalesRaw)) {
    const literales = literalesRaw
      .map((literal) => texto(literal))
      .filter((literal): literal is string => literal !== undefined && literal !== "");
    if (literales.length > 0) entidad.literales = literales;
  } else {
    // Se marca siempre: solo afecta si la entidad actual es una enumeración.
    entidad.literalesOmitidos = true;
  }

  return entidad;
}

function normalizarRelacion(
  valor: unknown,
  indice: number,
  entidades: EntidadCanonica[],
): RelacionCanonica | string {
  if (!esObjeto(valor)) return `Relación #${indice + 1} inválida: se esperaba un objeto.`;

  const idRaw = primero(valor.id, valor.key, valor.clave);
  const id = texto(idRaw) ?? `e${indice + 1}`;
  const idImplicito = texto(idRaw) === undefined;
  const origenRaw = texto(primero(valor.origen, valor.from, valor.fuente, valor.source));
  const destinoRaw = texto(primero(valor.destino, valor.to, valor.destino, valor.target));
  if (!origenRaw) return `Relación '${id}' sin 'origen'.`;
  if (!destinoRaw) return `Relación '${id}' sin 'destino'.`;

  const porId = new Map<string, string>();
  const porNombre = new Map<string, string>();
  for (const entidad of entidades) {
    porId.set(entidad.id.toLowerCase(), entidad.id);
    porId.set(normalizarNombre(entidad.nombre), entidad.id);
    porNombre.set(normalizarNombre(entidad.nombre), entidad.id);
  }

  const resolver = (referencia: string): string | undefined =>
    porId.get(referencia.toLowerCase()) ?? porNombre.get(normalizarNombre(referencia));

  const origen = resolver(origenRaw);
  const destino = resolver(destinoRaw);
  if (!origen) return `Relación '${id}': no existe la entidad de origen '${origenRaw}'.`;
  if (!destino) return `Relación '${id}': no existe la entidad de destino '${destinoRaw}'.`;

  const tipoRaw = primero(valor.tipo, valor.type, valor.kind, valor.categoria);
  const tipoNormalizado = normalizarTipoRelacion(tipoRaw);
  const tipo: TipoRelacion = tipoNormalizado ?? "association";

  const relacion: RelacionCanonica = { id, origen, destino, tipo };
  if (idImplicito) relacion.idImplicito = true;
  if (tipoNormalizado === null) relacion.tipoExplicito = false;

  const origenMult = texto(
    primero(valor.origenMult, valor.fromMult, valor.multiplicidadOrigen),
  );
  const destinoMult = texto(
    primero(valor.destinoMult, valor.toMult, valor.multiplicidadDestino),
  );
  const etiqueta = texto(primero(valor.etiqueta, valor.label, valor.nombre));

  if (origenMult !== undefined) relacion.origenMult = origenMult;
  if (destinoMult !== undefined) relacion.destinoMult = destinoMult;
  if (etiqueta !== undefined) relacion.etiqueta = etiqueta;
  return relacion;
}

function normalizarConsulta(valor: unknown): ConsultaCanonica | null {
  if (!esObjeto(valor)) return null;
  const nombre = texto(primero(valor.herramienta, valor.tool, valor.name, valor.nombre));
  if (!nombre) return null;
  const herramienta = nombre as ConsultaHerramienta;
  if (!CONSULTAS_PERMITIDAS.includes(herramienta)) return null;
  const args = primero(valor.args, valor.argumentos, valor.parameters);
  return {
    herramienta,
    ...(esObjeto(args) ? { args } : {}),
  };
}

/**
 * Normaliza y valida la salida del modelo.
 *
 * Devuelve un error legible (para el reintento) cuando la estructura no se
 * puede rescatar. Los miembros sueltos inválidos hacen fallar la validación
 * para no aplicar cambios a medias.
 */
export function validarSalida(valor: unknown): ResultadoValidacion<SalidaModelo> {
  if (!esObjeto(valor)) return { ok: false, error: "La respuesta no es un objeto JSON." };

  const entidadesRaw = primero(valor.entidades, valor.entities, valor.clases, valor.classes);
  const relacionesRaw = primero(valor.relaciones, valor.relations, valor.links, valor.enlaces);
  const consultasRaw = primero(valor.consultas, valor.queries, valor.reads);

  const tieneEntidades = Array.isArray(entidadesRaw) && entidadesRaw.length > 0;
  const tieneRelaciones = Array.isArray(relacionesRaw) && relacionesRaw.length > 0;
  const tieneConsultas = Array.isArray(consultasRaw) && consultasRaw.length > 0;
  const tipo = normalizarTipoSalida(
    primero(valor.tipo, valor.type, valor.kind),
    tieneEntidades || tieneRelaciones,
    tieneConsultas,
  );

  const mensaje = texto(primero(valor.mensaje, valor.message, valor.content, valor.texto)) ?? "";

  if (tipo === "chat") {
    return { ok: true, value: { tipo, mensaje } };
  }

  if (tipo === "consulta") {
    if (!Array.isArray(consultasRaw) || consultasRaw.length === 0) {
      return { ok: false, error: "La salida 'consulta' no incluye 'consultas'." };
    }
    const consultas: ConsultaCanonica[] = [];
    for (const consultaRaw of consultasRaw) {
      const consulta = normalizarConsulta(consultaRaw);
      if (consulta) consultas.push(consulta);
    }
    if (consultas.length === 0) {
      return {
        ok: false,
        error:
          "Ninguna consulta es válida. Usa solo: consultarHistorial, consultarPlan, getState o validate.",
      };
    }
    return { ok: true, value: { tipo, mensaje, consultas } };
  }

  // tipo === "diagrama"
  if (!Array.isArray(entidadesRaw)) {
    return { ok: false, error: "La salida 'diagrama' no incluye la lista 'entidades'." };
  }

  const entidades: EntidadCanonica[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < entidadesRaw.length; i += 1) {
    const resultado = normalizarEntidad(entidadesRaw[i], i);
    if (typeof resultado === "string") return { ok: false, error: resultado };
    const id = resultado.id.toLowerCase();
    if (ids.has(id)) return { ok: false, error: `Id de entidad duplicado: '${resultado.id}'.` };
    ids.add(id);
    entidades.push(resultado);
  }

  const relaciones: RelacionCanonica[] = [];
  const idsRelacion = new Set<string>();
  for (let i = 0; i < lista(relacionesRaw).length; i += 1) {
    const resultado = normalizarRelacion(lista(relacionesRaw)[i], i, entidades);
    if (typeof resultado === "string") return { ok: false, error: resultado };
    const id = resultado.id.toLowerCase();
    if (idsRelacion.has(id)) return { ok: false, error: `Id de relación duplicado: '${resultado.id}'.` };
    idsRelacion.add(id);
    relaciones.push(resultado);
  }

  const diagrama: DiagramaCanonico = { entidades, relaciones };
  return {
    ok: true,
    value: {
      tipo,
      mensaje,
      entidades: diagrama.entidades,
      relaciones: diagrama.relaciones,
      ...(relacionesRaw === undefined ? { relacionesOmitidas: true } : {}),
    },
  };
}
