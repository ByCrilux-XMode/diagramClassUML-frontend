import api from "@/lib/api";
import type { PersonaIA } from "@/lib/ia/types";

export interface PersonaChat {
  usuarioId: number;
  nombre: string;
}

export type TipoSucesoChat = "propuesta.aplicada" | "propuesta.descartada";

export interface SucesoChat {
  tipo: TipoSucesoChat;
  turnoId: string;
  cambios: number;
  errores: string[];
  actor: PersonaChat;
}

export interface MensajeChat {
  _id: string;
  salaId: string;
  proyectoId: number;
  tipo: "texto" | "suceso";
  autorTipo: "humano" | "ia";
  autorUsuarioId: number | null;
  autorNombre: string;
  modelo: string | null;
  contenido: string | null;
  suceso: SucesoChat | null;
  turnoId: string | null;
  solicitadoPor: PersonaChat | null;
  creadoEn: string;
}

export interface ResumenSalaChat {
  texto: string;
  hastaMensajeId: string;
  hastaCreadoEn: string;
  modelo: string | null;
  actualizadoEn: string;
}

export interface SalaChat {
  _id: string;
  proyectoId: number;
  tipo: "grupo";
  creadaEn: string;
  resumen: ResumenSalaChat | null;
}

export interface ListaMensajes {
  datos: MensajeChat[];
  siguiente: string | null;
}

export async function obtenerSala(proyectoId: string | number): Promise<SalaChat> {
  const { data } = await api.get<SalaChat>(`/proyectos/${proyectoId}/chat/sala`);
  return data;
}

export async function listarMensajes(
  proyectoId: string | number,
  opciones: { cursor?: string; limite?: number } = {},
): Promise<ListaMensajes> {
  const { data } = await api.get<ListaMensajes>(`/proyectos/${proyectoId}/chat/mensajes`, {
    params: { cursor: opciones.cursor, limite: opciones.limite ?? 50 },
  });
  return data;
}

export async function enviarMensaje(
  proyectoId: string | number,
  input: {
    contenido: string;
    claveIdempotencia?: string;
    autorTipo?: "humano" | "ia";
    modelo?: string;
    turnoId?: string;
    solicitadoPor?: PersonaIA;
  },
): Promise<{ mensaje: MensajeChat; duplicado: boolean }> {
  const { data } = await api.post<{ mensaje: MensajeChat; duplicado: boolean }>(
    `/proyectos/${proyectoId}/chat/mensajes`,
    input,
  );
  return data;
}

export async function enviarSuceso(
  proyectoId: string | number,
  input: {
    tipo: TipoSucesoChat;
    turnoId: string;
    cambios: number;
    errores?: string[];
    claveIdempotencia?: string;
  },
): Promise<{ mensaje: MensajeChat; duplicado: boolean }> {
  const { data } = await api.post<{ mensaje: MensajeChat; duplicado: boolean }>(
    `/proyectos/${proyectoId}/chat/sucesos`,
    input,
  );
  return data;
}

/**
 * Persiste el resumen rodante de la sala.
 *
 * El servidor solo lo acepta si el mensaje de referencia es posterior al que
 * cubre el resumen vigente; `actualizado: false` significa que otro cliente ya
 * había resumido más recientemente.
 */
export async function actualizarResumen(
  proyectoId: string | number,
  input: { texto: string; hastaMensajeId: string; modelo?: string },
): Promise<{ sala: SalaChat; actualizado: boolean }> {
  const { data } = await api.patch<{ sala: SalaChat; actualizado: boolean }>(
    `/proyectos/${proyectoId}/chat/sala/resumen`,
    input,
  );
  return data;
}

/**
 * Historial persistido del proyecto, en orden cronológico ascendente.
 * Excluye sucesos: no son conversación y el modelo los leería como suyos.
 */
export async function historialContexto(
  proyectoId: string | number,
  limite: number,
): Promise<MensajeChat[]> {
  const { data } = await api.get<ListaMensajes>(`/proyectos/${proyectoId}/chat/mensajes`, {
    params: { contexto: true, limite },
  });
  return data.datos.filter((mensaje) => mensaje.tipo === "texto" && (mensaje.contenido ?? "").trim() !== "");
}
