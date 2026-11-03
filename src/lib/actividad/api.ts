import api from "@/lib/api";
import type { EventoActividad } from "./cliente";

export interface EventoApi extends EventoActividad {
  _id: string;
  proyectoId: number;
  creadoEn: string;
  actorUsuarioId: number | null;
}

export interface ListaEventos {
  datos: EventoApi[];
  siguiente: string | null;
}

export interface FiltrosActividad {
  cursor?: string;
  limite?: number;
  actorTipo?: "humano" | "ia" | "sistema";
  actorUsuarioId?: number;
  actorNombre?: string;
  tipo?: string;
  entidad?: string;
  /** ISO 8601; filtra por fecha de registro. */
  desde?: string;
  hasta?: string;
}

export async function listarEventos(
  proyectoId: string | number,
  filtros: FiltrosActividad = {},
): Promise<ListaEventos> {
  const { data } = await api.get<ListaEventos>(`/proyectos/${proyectoId}/eventos`, {
    params: { ...filtros, limite: filtros.limite ?? 50 },
  });
  return data;
}

export interface UltimoTurnoIA {
  turnoId: string | null;
  eventos: EventoApi[];
  deshacible: boolean;
  motivo?: string;
  entidades: string[];
}

/**
 * Elegibilidad de la reversión (fase 9, D69). Solo CREADOR y EDITOR: el
 * servidor responde 403 a un LECTOR o a un ajeno.
 */
export async function obtenerUltimoTurnoIA(
  proyectoId: string | number,
): Promise<UltimoTurnoIA> {
  const { data } = await api.get<UltimoTurnoIA>(
    `/proyectos/${proyectoId}/eventos/ultimo-turno-ia`,
  );
  return data;
}
