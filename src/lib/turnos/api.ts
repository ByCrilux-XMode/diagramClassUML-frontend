import api from "@/lib/api";
import type { AmbitoIA, ModoIA } from "@/lib/editorTools";

export type EstadoTurno = "corriendo" | "listo" | "error";

export interface TurnoIA {
  _id: string;
  proyectoId: number;
  activo: boolean;
  estado: EstadoTurno;
  modo: ModoIA;
  salaId: string | null;
  mensajeId: string | null;
  proveedor: string | null;
  modelo: string | null;
  iniciadoPor: { usuarioId: number; nombre: string };
  iniciadoEn: string;
  terminadoEn: string | null;
  arriendo: boolean;
  motivo: string | null;
}

export interface ResultadoReclamo {
  turno: TurnoIA;
  arriendoLiberado: boolean;
}

export type MotivoRechazo = "sin_permiso" | "ocupado" | "sin_conexion";

/** Error de reclamo con un motivo que la interfaz puede traducir. */
export class ErrorTurno extends Error {
  constructor(
    readonly motivo: MotivoRechazo,
    mensaje: string,
    readonly turnoActivo?: TurnoIA | null,
  ) {
    super(mensaje);
    this.name = "ErrorTurno";
  }
}

/**
 * Reclama el único turno activo del proyecto. El servidor valida el modo contra
 * el rol: `build` exige permiso de escritura.
 */
export async function reclamarTurno(
  proyectoId: string | number,
  input: {
    modo: ModoIA;
    salaId?: string;
    mensajeId?: string;
    proveedor?: string;
    modelo?: string;
  },
): Promise<ResultadoReclamo> {
  try {
    const { data } = await api.post<ResultadoReclamo>(`/proyectos/${proyectoId}/turnos`, input);
    return data;
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number; data?: unknown } })?.response?.status;
    const cuerpo = (err as { response?: { data?: { turno?: TurnoIA | null } } })?.response?.data;
    if (status === 403) {
      throw new ErrorTurno("sin_permiso", "Tu rol no permite iniciar turnos de edición de la IA.");
    }
    if (status === 409) {
      throw new ErrorTurno(
        "ocupado",
        "La IA ya está respondiendo en este proyecto; espera a que termine.",
        cuerpo?.turno ?? null,
      );
    }
    throw new ErrorTurno("sin_conexion", "No se pudo iniciar el turno de la IA.");
  }
}

/** Reporta el cierre del turno. Solo quien lo reclamó puede hacerlo. */
export async function cerrarTurno(
  proyectoId: string | number,
  turnoId: string,
  input: { estado: "listo" | "error"; motivo?: string; proveedor?: string; modelo?: string },
): Promise<TurnoIA> {
  const { data } = await api.post<{ turno: TurnoIA }>(
    `/proyectos/${proyectoId}/turnos/${turnoId}/estado`,
    input,
  );
  return data.turno;
}

/** El ámbito privado nunca reclama turno (D43). */
export function requiereTurno(ambito: AmbitoIA): boolean {
  return ambito === "grupo";
}
