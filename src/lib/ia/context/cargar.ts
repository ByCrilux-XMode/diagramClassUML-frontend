import { listarColaboradores } from "@/lib/colaboradores";
import { listarEventos } from "@/lib/actividad/api";
import { historialContexto, obtenerSala } from "@/lib/chat/api";
import { listarPlanes } from "@/lib/planes/api";
import type { Colaborador } from "@/types/proyecto";
import type {
  ColaboradorContexto,
  EventoContexto,
  FuentesContexto,
  MensajeContexto,
  PlanContexto,
} from "./builder";

/**
 * Loader de las fuentes del contexto (D44).
 *
 * Cada fuente falla por separado: si el usuario no puede leer colaboradores o
 * la bitácora está caída, el turno sigue con las demás capas y `degradado[]`
 * deja constancia. Las consultas salen en paralelo.
 */

export interface OpcionesCarga {
  /** Solo el grupo lee la conversación persistida; el privado usa su historial local. */
  incluirConversacion: boolean;
  /** Mensaje que disparó el turno: viaja como `userMessage`, no en el historial. */
  excluirMensajeId?: string;
  limiteEventos?: number;
  limiteMensajes?: number;
}

export const LIMITE_EVENTOS_CONTEXTO = 40;
export const LIMITE_MENSAJES_CONTEXTO = 40;

async function intentar<T>(
  nombre: string,
  fn: () => Promise<T>,
  degradado: string[],
): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    degradado.push(nombre);
    return undefined;
  }
}

function nombreDeColaborador(colaborador: Colaborador): string {
  const persona = colaborador.usuario?.persona;
  const nombre = [persona?.nombre, persona?.apellido].filter(Boolean).join(" ").trim();
  return nombre || colaborador.usuario?.username || `Usuario ${colaborador.usuarioId}`;
}

export async function cargarFuentes(
  proyectoId: string | number | null | undefined,
  opciones: OpcionesCarga,
): Promise<FuentesContexto> {
  if (proyectoId === null || proyectoId === undefined || `${proyectoId}`.trim() === "") {
    return { degradado: ["proyecto"] };
  }

  const degradado: string[] = [];
  const limiteEventos = opciones.limiteEventos ?? LIMITE_EVENTOS_CONTEXTO;
  const limiteMensajes = opciones.limiteMensajes ?? LIMITE_MENSAJES_CONTEXTO;

  const [colaboradores, eventos, planes, sala, mensajes] = await Promise.all([
    intentar("colaboradores", () => listarColaboradores(proyectoId), degradado),
    intentar("actividad", () => listarEventos(proyectoId, { limite: limiteEventos }), degradado),
    intentar("plan", () => listarPlanes(proyectoId, 1), degradado),
    // D52: el resumen es memoria del grupo; en privado ni siquiera se pide.
    opciones.incluirConversacion
      ? intentar("sala", () => obtenerSala(proyectoId), degradado)
      : Promise.resolve(undefined),
    opciones.incluirConversacion
      ? intentar("conversacion", () => historialContexto(proyectoId, limiteMensajes), degradado)
      : Promise.resolve(undefined),
  ]);

  const colaboradoresContexto: ColaboradorContexto[] | undefined = colaboradores?.map(
    (colaborador) => ({
      usuarioId: colaborador.usuarioId,
      nombre: nombreDeColaborador(colaborador),
      rol: colaborador.permiso?.nombre ?? "SIN PERMISO",
      username: colaborador.usuario?.username,
    }),
  );

  const actividad: EventoContexto[] | undefined = eventos?.datos.map((evento) => ({
    creadoEn: evento.creadoEn,
    actorNombre: evento.actorNombre,
    actorTipo: evento.actorTipo,
    tipo: evento.tipo,
    resumen: evento.resumen,
    entidades: evento.entidades,
  }));

  const plan: PlanContexto | null | undefined = planes
    ? planes.vigente
      ? {
          version: planes.vigente.version,
          contenido: planes.vigente.contenido,
          autorNombre: planes.vigente.autorNombre,
          creadoEn: planes.vigente.creadoEn,
          origen: planes.vigente.origen,
        }
      : null
    : undefined;

  const resumen = sala?.resumen
    ? {
        texto: sala.resumen.texto,
        hastaCreadoEn: sala.resumen.hastaCreadoEn,
        modelo: sala.resumen.modelo,
      }
    : null;

  const mensajesContexto: MensajeContexto[] | undefined = mensajes
    ?.filter((mensaje) => mensaje._id !== opciones.excluirMensajeId)
    .map((mensaje) => ({
      role: mensaje.autorTipo === "ia" ? "assistant" : "user",
      content: mensaje.contenido ?? "",
      creadoEn: mensaje.creadoEn,
    }));

  return {
    colaboradores: colaboradoresContexto,
    actividad,
    plan,
    resumen,
    mensajes: mensajesContexto,
    degradado,
  };
}
