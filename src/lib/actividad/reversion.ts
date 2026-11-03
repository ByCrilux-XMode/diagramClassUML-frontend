import type { AttributeData, MethodData } from "@/types/uml";
import { executeToolSync, getDiagram } from "@/lib/editorTools";
import type { ToolName } from "@/lib/editorTools";
import type { EventoActividad } from "./cliente";
import type { CambioActividad } from "./diff";
import type { ClaseSemantica, EstadoSemantico, RelacionSemantica } from "./estado";
import { leerEstadoSemantico } from "./estado";
import { esClaveTecnica, etiquetaCampo, etiquetaEntidad } from "./etiquetas";

/**
 * Reversión del último lote de la IA (fase 9, D69/D70).
 *
 * El servidor solo dice si el turno es reversible; el cliente reconstruye las
 * herramientas inversas desde `antes` y las aplica en orden inverso por el
 * mismo camino de escritura que el HITL (`executeToolSync`). La reversión se
 * registra como un turno humano con un `turnoId` nuevo y `revierteTurnoId`.
 */

export interface TurnoIAReversible {
  turnoId: string | null;
  eventos: EventoActividad[];
  deshacible: boolean;
  motivo?: string;
  entidades: string[];
}

export interface PropuestaReversion {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  round: number;
}

export interface AutorReversion {
  usuarioId: number;
  nombre: string;
}

export class ErrorReversion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorReversion";
  }
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return Boolean(valor) && typeof valor === "object";
}

function esClase(valor: unknown): valor is ClaseSemantica {
  return esObjeto(valor) && typeof valor.name === "string" && typeof valor.key === "string";
}

function esRelacion(valor: unknown): valor is RelacionSemantica {
  return (
    esObjeto(valor) &&
    typeof valor.from === "string" &&
    typeof valor.to === "string" &&
    typeof valor.category === "string"
  );
}

function esAtributo(valor: unknown): valor is AttributeData {
  return esObjeto(valor) && typeof valor.name === "string";
}

function esMetodo(valor: unknown): valor is MethodData {
  return esObjeto(valor) && typeof valor.name === "string";
}

function claveClaseDeEntidad(entidadKey: string): string {
  const punto = entidadKey.indexOf(".");
  return punto > 0 ? entidadKey.slice(0, punto) : entidadKey;
}

function nombreDeEntidad(entidadKey: string): string {
  const punto = entidadKey.indexOf(".");
  return punto >= 0 ? entidadKey.slice(punto + 1) : entidadKey;
}

function nombreDeMetodo(entidadKey: string): string {
  const nombre = nombreDeEntidad(entidadKey);
  return nombre.endsWith("()") ? nombre.slice(0, -2) : nombre;
}

/** Etiqueta humana de una relación a partir de sus extremos. */
function nombreRelacion(entidadKey: string, ...candidatos: unknown[]): string {
  for (const candidato of candidatos) {
    if (!esRelacion(candidato)) continue;
    const origen = etiquetaEntidad(candidato.from);
    const destino = etiquetaEntidad(candidato.to);
    if (origen && destino) return `${origen} → ${destino}`;
  }
  const [from, , to] = entidadKey.split("|");
  const origen = etiquetaEntidad(from);
  const destino = etiquetaEntidad(to);
  return origen && destino ? `${origen} → ${destino}` : "";
}

/** Etiqueta humana de un atributo o método (`clase.nombre` → `nombre`). */
function nombreMiembro(entidadKey: string): string {
  const nombre = nombreDeEntidad(entidadKey).replace(/\(\)$/, "").trim();
  return esClaveTecnica(nombre) ? "" : nombre;
}

/** Nombre visible de la entidad de un cambio, sin claves internas. */
function nombreVisibleCambio(cambio: CambioActividad): string {
  switch (cambio.entidadTipo) {
    case "relacion":
      return nombreRelacion(cambio.entidadKey, cambio.antes, cambio.despues);
    case "atributo":
    case "metodo":
      return nombreMiembro(cambio.entidadKey);
    case "clase": {
      const clase = esClase(cambio.despues) ? cambio.despues : esClase(cambio.antes) ? cambio.antes : null;
      return clase?.name ?? etiquetaEntidad(cambio.entidadKey);
    }
  }
}

function argsDeClase(clase: ClaseSemantica): Record<string, unknown> {
  const args: Record<string, unknown> = {
    key: clase.key,
    name: clase.name,
    category: clase.category,
  };
  if (clase.isAbstract !== undefined) args.isAbstract = clase.isAbstract;
  if (Array.isArray(clase.literals)) args.literals = [...clase.literals];
  if (Array.isArray(clase.attributes)) {
    args.attributes = clase.attributes.map((atributo) => ({ ...atributo }));
  }
  if (Array.isArray(clase.methods)) {
    args.methods = clase.methods.map((metodo) => ({
      ...metodo,
      parameters: (metodo.parameters ?? []).map((parametro) => ({ ...parametro })),
    }));
  }
  return args;
}

function argsDeRelacion(relacion: RelacionSemantica): Record<string, unknown> {
  const args: Record<string, unknown> = {
    from: relacion.from,
    to: relacion.to,
    kind: relacion.category,
  };
  if (relacion.fromMultiplicity !== undefined) args.fromMult = relacion.fromMultiplicity;
  if (relacion.toMultiplicity !== undefined) args.toMult = relacion.toMultiplicity;
  if (relacion.name !== undefined) args.label = relacion.name;
  return args;
}

function aTexto(valor: unknown): string {
  return typeof valor === "string" ? valor : valor === null || valor === undefined ? "" : String(valor);
}

function inversaDeCambio(cambio: CambioActividad): PropuestaReversion {
  const entidad = cambio.entidadKey;
  const antes = cambio.antes;
  const despues = cambio.despues;

  if (cambio.accion === "crear") {
    switch (cambio.entidadTipo) {
      case "clase": {
        const clase = esClase(despues) ? despues : null;
        return {
          id: "",
          toolName: "removeClass",
          args: { key: clase?.key ?? entidad },
          round: 0,
        };
      }
      case "relacion": {
        const relacion = esRelacion(despues) ? despues : null;
        const [from, , to] = entidad.split("|");
        return {
          id: "",
          toolName: "updateRelation",
          args: {
            action: "remove",
            ...(relacion
              ? { from: relacion.from, to: relacion.to }
              : { from, to }),
          },
          round: 0,
        };
      }
      case "atributo": {
        const atributo = esAtributo(despues) ? despues : null;
        return {
          id: "",
          toolName: "updateAttribute",
          args: {
            classKey: claveClaseDeEntidad(entidad),
            action: "remove",
            attribute: { name: atributo?.name ?? nombreDeEntidad(entidad) },
          },
          round: 0,
        };
      }
      case "metodo": {
        const metodo = esMetodo(despues) ? despues : null;
        return {
          id: "",
          toolName: "updateMethod",
          args: {
            classKey: claveClaseDeEntidad(entidad),
            action: "remove",
            method: { name: metodo?.name ?? nombreDeMetodo(entidad) },
          },
          round: 0,
        };
      }
    }
  }

  if (cambio.accion === "eliminar") {
    switch (cambio.entidadTipo) {
      case "clase":
        if (!esClase(antes)) {
          const nombre = etiquetaEntidad(entidad);
          throw new ErrorReversion(
            `No se puede reconstruir ${nombre ? `la clase «${nombre}»` : "esa clase"}: el evento no guardó su estado anterior.`,
          );
        }
        return { id: "", toolName: "addClass", args: argsDeClase(antes), round: 0 };
      case "relacion":
        if (!esRelacion(antes)) {
          const nombre = nombreRelacion(entidad, despues, antes);
          throw new ErrorReversion(
            `No se puede reconstruir ${nombre ? `la relación «${nombre}»` : "esa relación"}: el evento no guardó su estado anterior.`,
          );
        }
        return { id: "", toolName: "connect", args: argsDeRelacion(antes), round: 0 };
      case "atributo":
        if (!esAtributo(antes)) {
          const nombre = nombreMiembro(entidad);
          throw new ErrorReversion(
            `No se puede reconstruir ${nombre ? `el atributo «${nombre}»` : "ese atributo"}: el evento no guardó su estado anterior.`,
          );
        }
        return {
          id: "",
          toolName: "updateAttribute",
          args: {
            classKey: claveClaseDeEntidad(entidad),
            action: "add",
            attribute: { ...antes },
          },
          round: 0,
        };
      case "metodo":
        if (!esMetodo(antes)) {
          const nombre = nombreMiembro(entidad);
          throw new ErrorReversion(
            `No se puede reconstruir ${nombre ? `el método «${nombre}»` : "ese método"}: el evento no guardó su estado anterior.`,
          );
        }
        return {
          id: "",
          toolName: "updateMethod",
          args: {
            classKey: claveClaseDeEntidad(entidad),
            action: "add",
            method: {
              ...antes,
              parameters: (antes.parameters ?? []).map((parametro) => ({ ...parametro })),
            },
          },
          round: 0,
        };
    }
  }

  // actualizar: sin `antes` no hay nada que restaurar.
  if (antes === undefined || antes === null) {
    const nombre = nombreVisibleCambio(cambio);
    throw new ErrorReversion(
      `El cambio en ${nombre ? `«${nombre}»` : "la entidad"} no tiene valor anterior; la bitácora no puede reconstruirlo.`,
    );
  }

  const campo = cambio.campo ?? "";
  switch (cambio.entidadTipo) {
    case "clase": {
      if (campo === "category") {
        throw new ErrorReversion(
          "La categoría de una clase no se puede restaurar con las herramientas actuales.",
        );
      }
      if (campo === "literals") {
        return {
          id: "",
          toolName: "updateClass",
          args: { key: entidad, literals: Array.isArray(antes) ? [...antes] : [] },
          round: 0,
        };
      }
      return {
        id: "",
        toolName: "updateClass",
        args: { key: entidad, [campo]: antes },
        round: 0,
      };
    }
    case "atributo":
      return {
        id: "",
        toolName: "updateAttribute",
        args: {
          classKey: claveClaseDeEntidad(entidad),
          action: "update",
          attribute: { name: nombreDeEntidad(entidad), [campo]: antes },
        },
        round: 0,
      };
    case "metodo":
      return {
        id: "",
        toolName: "updateMethod",
        args: {
          classKey: claveClaseDeEntidad(entidad),
          action: "update",
          method: { name: nombreDeMetodo(entidad), [campo]: antes },
        },
        round: 0,
      };
    case "relacion": {
      const relacion = esRelacion(despues) ? despues : esRelacion(antes) ? antes : null;
      const [fromFallo, , toFallo] = entidad.split("|");
      const campoRelacion =
        campo === "fromMultiplicity"
          ? "fromMult"
          : campo === "toMultiplicity"
            ? "toMult"
            : campo === "name"
              ? "label"
              : campo === "category"
                ? "kind"
                : null;
      if (!campoRelacion) {
        const nombre = nombreRelacion(entidad, despues, antes);
        throw new ErrorReversion(
          `El campo «${etiquetaCampo(campo)}» de ${nombre ? `la relación «${nombre}»` : "esa relación"} no se puede restaurar.`,
        );
      }
      return {
        id: "",
        toolName: "updateRelation",
        args: {
          action: "update",
          ...(relacion
            ? { from: relacion.from, to: relacion.to }
            : { from: fromFallo, to: toFallo }),
          [campoRelacion]: aTexto(antes),
        },
        round: 0,
      };
    }
  }

  throw new ErrorReversion(`Tipo de entidad desconocido en la bitácora: ${cambio.entidadTipo}.`);
}

/**
 * Prioridad dentro de un mismo evento. El orden global es el inverso al turno,
 * pero dentro de un evento hay dependencias: las relaciones se quitan antes de
 * borrar su clase y una clase restaurada debe existir antes de reconectar sus
 * relaciones.
 */
function prioridadInversa(propuesta: PropuestaReversion): number {
  const accion = propuesta.args.action;
  if (propuesta.toolName === "updateRelation" && accion === "remove") return 0;
  if (propuesta.toolName === "updateAttribute" && accion === "remove") return 1;
  if (propuesta.toolName === "updateMethod" && accion === "remove") return 1;
  if (propuesta.toolName === "removeClass") return 2;
  if (propuesta.toolName === "addClass") return 3;
  if (propuesta.toolName === "connect") return 4;
  if (propuesta.toolName === "updateAttribute" && accion === "add") return 5;
  if (propuesta.toolName === "updateMethod" && accion === "add") return 5;
  return 6;
}

/**
 * Construye las herramientas inversas del turno, del último evento al primero.
 * Lanza `ErrorReversion` si un cambio no se puede reconstruir.
 */
export function construirReversion(turno: TurnoIAReversible): PropuestaReversion[] {
  if (!turno.turnoId) {
    throw new ErrorReversion("No hay un turno de IA que deshacer.");
  }
  if (!turno.deshacible) {
    throw new ErrorReversion(turno.motivo ?? "El turno no se puede deshacer.");
  }
  if (turno.eventos.length === 0) {
    throw new ErrorReversion("El turno no tiene eventos que reconstruir.");
  }

  const propuestas: PropuestaReversion[] = [];
  for (const evento of [...turno.eventos].reverse()) {
    const inversas = (evento.cambios ?? []).map((cambio) => {
      try {
        return inversaDeCambio(cambio);
      } catch (error) {
        if (error instanceof ErrorReversion) throw error;
        const nombre = nombreVisibleCambio(cambio);
        throw new ErrorReversion(
          error instanceof Error ? error.message : `No se pudo invertir ${nombre ? `«${nombre}»` : "ese cambio"}.`,
        );
      }
    });
    inversas.sort((a, b) => prioridadInversa(a) - prioridadInversa(b));
    propuestas.push(...inversas);
  }

  return propuestas.map((propuesta, indice) => ({
    ...propuesta,
    id: `reversion-${indice + 1}`,
  }));
}

function fusionarConEstado(
  propuesta: PropuestaReversion,
  estado: EstadoSemantico,
): Record<string, unknown> {
  if (propuesta.toolName === "updateAttribute" && propuesta.args.action === "update") {
    const classKey = String(propuesta.args.classKey ?? "");
    const atributo = propuesta.args.attribute as Record<string, unknown> | undefined;
    const actual = estado.clases
      .get(classKey)
      ?.attributes?.find((item) => item.name === atributo?.name);
    if (actual && atributo) {
      return { ...propuesta.args, attribute: { ...actual, ...atributo } };
    }
  }

  if (propuesta.toolName === "updateMethod" && propuesta.args.action === "update") {
    const classKey = String(propuesta.args.classKey ?? "");
    const metodo = propuesta.args.method as Record<string, unknown> | undefined;
    const actual = estado.clases
      .get(classKey)
      ?.methods?.find((item) => item.name === metodo?.name);
    if (actual && metodo) {
      return {
        ...propuesta.args,
        method: {
          ...actual,
          ...metodo,
          parameters: Array.isArray(metodo.parameters)
            ? metodo.parameters
            : (actual.parameters ?? []).map((parametro) => ({ ...parametro })),
        },
      };
    }
  }

  return propuesta.args;
}

export interface ResultadoReversion {
  aplicadas: number;
  errores: string[];
  traza: Array<{ toolName: string; ok: boolean; error?: string }>;
}

export interface OpcionesAplicarReversion {
  /** Inyectable en pruebas. Por defecto usa el mismo camino que el HITL. */
  ejecutar?: (toolName: string, args: Record<string, unknown>) => { ok: boolean; error?: string };
  /** Inyectable en pruebas. Por defecto lee el diagrama activo. */
  leerEstado?: () => EstadoSemantico;
  proyectoId?: string | null;
}

/**
 * Aplica las propuestas en orden. Se detiene en el primer error para no dejar
 * una reversión a medias marcada como exitosa. El llamador decide si el
 * resultado completo se registra como reversión o como turno humano normal.
 */
export function aplicarReversion(
  propuestas: PropuestaReversion[],
  opciones: OpcionesAplicarReversion = {},
): ResultadoReversion {
  const leerEstado =
    opciones.leerEstado ?? (() => leerEstadoSemantico(getDiagram()));
  const ejecutar =
    opciones.ejecutar ??
    ((toolName, args) =>
      executeToolSync(toolName as ToolName, args, {
        proyectoId: opciones.proyectoId ?? null,
      }));

  const resultado: ResultadoReversion = { aplicadas: 0, errores: [], traza: [] };

  for (const propuesta of propuestas) {
    let args: Record<string, unknown>;
    try {
      args = fusionarConEstado(propuesta, leerEstado());
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      resultado.errores.push(mensaje);
      resultado.traza.push({ toolName: propuesta.toolName, ok: false, error: mensaje });
      break;
    }

    let salida: { ok: boolean; error?: string };
    try {
      salida = ejecutar(propuesta.toolName, args);
    } catch (error) {
      salida = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    resultado.traza.push({
      toolName: propuesta.toolName,
      ok: salida.ok,
      error: salida.ok ? undefined : salida.error,
    });

    if (!salida.ok) {
      resultado.errores.push(salida.error ?? `Falló la herramienta ${propuesta.toolName}.`);
      break;
    }
    resultado.aplicadas += 1;
  }

  return resultado;
}

export function fechaLegible(iso: string | undefined): string {
  if (!iso) return "una fecha desconocida";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "una fecha desconocida";
  return fecha.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
}

export interface ElegibilidadReversion {
  /** Solo CREADOR/EDITOR con un turno reversible ven la acción. */
  mostrarBoton: boolean;
  /** Motivo visible cuando hay un turno de IA pero no se puede deshacer. */
  motivo: string | null;
  /** Cambios que aplicaría la reversión, para el texto de confirmación. */
  cambios: number;
}

/**
 * Decide qué ofrece la interfaz. Sin turno de IA no se muestra nada; con un
 * turno no reversible se explica el motivo y no se ofrece la acción.
 */
export function formatearElegibilidadReversion(
  turno: TurnoIAReversible | null,
  puedeEditar: boolean,
): ElegibilidadReversion {
  const cambios = turno?.eventos.reduce(
    (total, evento) => total + (evento.cambios?.length ?? 0),
    0,
  ) ?? 0;

  if (!puedeEditar || !turno?.turnoId) {
    return { mostrarBoton: false, motivo: null, cambios: 0 };
  }
  if (!turno.deshacible) {
    return {
      mostrarBoton: false,
      motivo: turno.motivo ?? "El turno ya no es reversible.",
      cambios,
    };
  }
  return { mostrarBoton: true, motivo: null, cambios };
}

export function construirResumenReversion(
  turno: TurnoIAReversible,
  autor: AutorReversion,
  entidadesRestauradas?: number,
): string {
  const cantidad = entidadesRestauradas ?? turno.entidades.length;
  const nombre = autor.nombre.trim() || "Alguien";
  const fecha = fechaLegible(turno.eventos[0]?.ocurridoEn);
  const entidades = cantidad === 1 ? "1 entidad" : `${cantidad} entidades`;
  return `${nombre} deshizo el lote de la IA del ${fecha}: restauró ${entidades}.`;
}

export interface MetaCapturaReversion {
  turnoId: string;
  revierteTurnoId: string;
  autor: AutorReversion;
  resumen: string;
}

interface CapturaReversion {
  meta: MetaCapturaReversion;
  eventos: EventoActividad[];
}

let captura: CapturaReversion | null = null;
let consumidor: ((eventos: EventoActividad[]) => void | Promise<void>) | null = null;

/** `useColaboracion` registra aquí el envío real de la bitácora. */
export function configurarEnvioReversion(
  enviar: ((eventos: EventoActividad[]) => void | Promise<void>) | null,
): void {
  consumidor = enviar;
}

export function iniciarCapturaReversion(meta: MetaCapturaReversion): void {
  captura = { meta, eventos: [] };
}

export function capturaReversionActiva(): boolean {
  return captura !== null;
}

/**
 * Retiene un evento mientras la reversión está en curso. Devuelve `true` si lo
 * capturó: en ese caso no debe encolarse todavía.
 */
export function capturarEventoReversion(evento: EventoActividad): boolean {
  if (!captura) return false;
  captura.eventos.push(evento);
  return true;
}

/**
 * Cierra la captura. Si la reversión fue exitosa, los eventos se marcan con el
 * turno nuevo y `revierteTurnoId`; si falló a mitad, quedan como un turno
 * humano normal, sin referencia al turno de IA.
 */
export async function finalizarCapturaReversion(
  exito: boolean,
): Promise<EventoActividad[]> {
  if (!captura) return [];
  const { meta, eventos } = captura;
  captura = null;

  const finales: EventoActividad[] = eventos.map((evento) =>
    exito
      ? {
          ...evento,
          actorTipo: "humano",
          actorUsuarioId: meta.autor.usuarioId,
          actorNombre: meta.autor.nombre,
          origen: "manual",
          turnoId: meta.turnoId,
          revierteTurnoId: meta.revierteTurnoId,
          modelo: null,
          solicitadoPor: null,
          aprobadoPor: {
            usuarioId: meta.autor.usuarioId,
            nombre: meta.autor.nombre,
          },
          resumen: meta.resumen,
        }
      : {
          ...evento,
          actorTipo: "humano",
          actorUsuarioId: meta.autor.usuarioId,
          actorNombre: meta.autor.nombre,
          origen: "manual",
          turnoId: null,
          revierteTurnoId: null,
          modelo: null,
          solicitadoPor: null,
          aprobadoPor: null,
        },
  );

  if (consumidor && finales.length > 0) {
    await consumidor(finales);
  }
  return finales;
}

/** Solo para pruebas: limpia la captura y el consumidor. */
export function reiniciarCapturaReversion(): void {
  captura = null;
  consumidor = null;
}
