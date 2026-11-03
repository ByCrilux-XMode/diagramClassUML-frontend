export type EstadoPropuesta = "pendiente" | "aprobando" | "aplicada" | "error" | "rechazada";

export interface PersonaPropuesta {
  usuarioId: number;
  nombre: string;
}

export interface ResultadoPropuesta {
  aplicadas: number;
  errores: string[];
}

export interface PropuestaApi {
  _id: string;
  proyectoId: number;
  turnoId: string;
  mensajeId: string | null;
  clavePropuesta: string;
  toolName: string;
  args: Record<string, unknown>;
  round: number;
  estado: EstadoPropuesta;
  solicitadoPor: PersonaPropuesta;
  modelo: string | null;
  aprobadoPor: PersonaPropuesta | null;
  reclamadaEn: string | null;
  resueltaEn: string | null;
  resultado: ResultadoPropuesta | null;
  creadoEn: string;
}

/** Un turno es la unidad que se aprueba o rechaza. */
export interface TurnoPendiente {
  turnoId: string;
  estado: EstadoPropuesta;
  mensajeId: string | null;
  solicitadoPor: PersonaPropuesta;
  modelo: string | null;
  aprobadoPor: PersonaPropuesta | null;
  reclamadaEn: string | null;
  resueltaEn: string | null;
  resultado: ResultadoPropuesta | null;
  creadoEn: string;
  resumen: string;
  propuestas: PropuestaApi[];
}

export interface LotePropuestasInput {
  turnoId: string;
  mensajeId?: string;
  modelo?: string;
  propuestas: Array<{
    clavePropuesta: string;
    toolName: string;
    args: Record<string, unknown>;
    round: number;
  }>;
}

export interface ResultadoAplicacion {
  estado: "aplicada" | "error";
  aplicadas: number;
  errores: string[];
}
