import api from "@/lib/api";
import type {
  EstadoPropuesta,
  LotePropuestasInput,
  PropuestaApi,
  ResultadoAplicacion,
  TurnoPendiente,
} from "./tipos";

/** Error con el estado del turno cuando otra persona se adelantó (409). */
export class ErrorPropuesta extends Error {
  constructor(
    mensaje: string,
    readonly estado?: EstadoPropuesta,
    readonly turno?: TurnoPendiente | null,
    readonly status?: number,
  ) {
    super(mensaje);
    this.name = "ErrorPropuesta";
  }
}

function leerError(err: unknown): {
  status?: number;
  mensaje?: string;
  estado?: EstadoPropuesta;
  turno?: TurnoPendiente | null;
} {
  const respuesta = (
    err as {
      response?: {
        status?: number;
        data?: {
          message?: string | { mensaje?: string };
          mensaje?: string;
          turno?: TurnoPendiente | null;
        };
      };
    }
  )?.response;
  const data = respuesta?.data;
  const mensaje =
    typeof data?.message === "string"
      ? data.message
      : (data?.message?.mensaje ?? data?.mensaje);
  return {
    status: respuesta?.status,
    mensaje,
    estado: data?.turno?.estado,
    turno: data?.turno ?? null,
  };
}

function traducir(err: unknown, porDefecto: string): ErrorPropuesta {
  const { status, mensaje, estado, turno } = leerError(err);
  if (status === 403) {
    return new ErrorPropuesta("Tu rol no puede realizar esta operación.", estado, turno, status);
  }
  if (status === 404) {
    return new ErrorPropuesta("El turno ya no existe en el proyecto.", estado, turno, status);
  }
  if (status === 409) {
    return new ErrorPropuesta(
      "Otra persona reclamó o resolvió este turno. Actualiza el panel para ver el estado.",
      estado,
      turno,
      status,
    );
  }
  return new ErrorPropuesta(mensaje ?? porDefecto, estado, turno, status);
}

export async function crearLotePropuestas(
  proyectoId: string | number,
  input: LotePropuestasInput,
): Promise<{ propuestas: PropuestaApi[]; creadas: number; duplicadas: number }> {
  try {
    const { data } = await api.post<{
      propuestas: PropuestaApi[];
      creadas: number;
      duplicadas: number;
    }>(`/proyectos/${proyectoId}/propuestas`, input);
    return data;
  } catch (err: unknown) {
    throw traducir(err, "No se pudo registrar la propuesta.");
  }
}

export async function listarPropuestas(
  proyectoId: string | number,
  opciones: { estado?: EstadoPropuesta; limite?: number } = {},
): Promise<TurnoPendiente[]> {
  try {
    const { data } = await api.get<{ datos: TurnoPendiente[] }>(
      `/proyectos/${proyectoId}/propuestas`,
      { params: { estado: opciones.estado ?? "pendiente", limite: opciones.limite ?? 100 } },
    );
    return data.datos;
  } catch (err: unknown) {
    throw traducir(err, "No se pudieron cargar las propuestas.");
  }
}

export async function aprobarLote(
  proyectoId: string | number,
  turnoId: string,
): Promise<{ turnoId: string; propuestas: PropuestaApi[] }> {
  try {
    const { data } = await api.post<{ turnoId: string; propuestas: PropuestaApi[] }>(
      `/proyectos/${proyectoId}/propuestas/${turnoId}/aprobar`,
      {},
    );
    return data;
  } catch (err: unknown) {
    throw traducir(err, "No se pudo reclamar el turno.");
  }
}

export async function rechazarLote(
  proyectoId: string | number,
  turnoId: string,
): Promise<{ turnoId: string; propuestas: PropuestaApi[] }> {
  try {
    const { data } = await api.post<{ turnoId: string; propuestas: PropuestaApi[] }>(
      `/proyectos/${proyectoId}/propuestas/${turnoId}/rechazar`,
      {},
    );
    return data;
  } catch (err: unknown) {
    throw traducir(err, "No se pudo rechazar el turno.");
  }
}

export async function reportarResultado(
  proyectoId: string | number,
  turnoId: string,
  resultado: ResultadoAplicacion,
): Promise<{ turnoId: string; propuestas: PropuestaApi[] }> {
  try {
    const { data } = await api.patch<{ turnoId: string; propuestas: PropuestaApi[] }>(
      `/proyectos/${proyectoId}/propuestas/${turnoId}/resultado`,
      {
        estado: resultado.estado,
        aplicadas: resultado.aplicadas,
        errores: resultado.errores,
      },
    );
    return data;
  } catch (err: unknown) {
    throw traducir(err, "Los cambios se aplicaron, pero no se pudo registrar el resultado.");
  }
}
