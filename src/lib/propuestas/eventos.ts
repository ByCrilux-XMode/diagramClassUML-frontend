import type {
  EstadoPropuesta,
  PersonaPropuesta,
  PropuestaApi,
  ResultadoPropuesta,
  TurnoPendiente,
} from "./tipos";

export interface EventoPropuestaCreada {
  tipo: "propuesta.creada";
  turnoId: string;
  propuestas: PropuestaApi[];
}

export interface EventoPropuestaResuelta {
  tipo: "propuesta.resuelta";
  turnoId: string;
  estado: EstadoPropuesta;
  aprobadoPor: PersonaPropuesta | null;
  resultado: ResultadoPropuesta | null;
}

function estadoDelTurno(propuestas: PropuestaApi[]): EstadoPropuesta {
  const estados = new Set(propuestas.map((propuesta) => propuesta.estado));
  if (estados.size === 1) return propuestas[0].estado;
  if (estados.has("pendiente")) return "pendiente";
  if (estados.has("aprobando")) return "aprobando";
  if (estados.has("error")) return "error";
  if (estados.has("rechazada")) return "rechazada";
  return "aplicada";
}

function resumenDelTurno(propuestas: PropuestaApi[]): string {
  const nombres = [...new Set(propuestas.map((propuesta) => propuesta.toolName))];
  return `${propuestas.length} cambio(s): ${nombres.slice(0, 5).join(", ")}`;
}

/** Construye la unidad que muestra el panel a partir de sus herramientas. */
export function turnoDesdePropuestas(propuestas: PropuestaApi[]): TurnoPendiente | null {
  if (propuestas.length === 0) return null;
  const ordenadas = [...propuestas].sort((a, b) => a.round - b.round);
  const primera = ordenadas[0];
  const conAprobador = ordenadas.find((propuesta) => propuesta.aprobadoPor);
  const conResultado = ordenadas.find((propuesta) => propuesta.resultado);
  return {
    turnoId: primera.turnoId,
    estado: estadoDelTurno(ordenadas),
    mensajeId: primera.mensajeId,
    solicitadoPor: primera.solicitadoPor,
    modelo: primera.modelo,
    aprobadoPor: conAprobador?.aprobadoPor ?? null,
    reclamadaEn: conAprobador?.reclamadaEn ?? null,
    resueltaEn: conResultado?.resueltaEn ?? null,
    resultado: conResultado?.resultado ?? null,
    creadoEn: primera.creadoEn,
    resumen: resumenDelTurno(ordenadas),
    propuestas: ordenadas,
  };
}

export function ordenarTurnos(turnos: TurnoPendiente[]): TurnoPendiente[] {
  return [...turnos].sort((a, b) => {
    const fechaA = new Date(a.creadoEn).getTime();
    const fechaB = new Date(b.creadoEn).getTime();
    if (fechaA !== fechaB) return fechaA - fechaB;
    return a.turnoId < b.turnoId ? -1 : a.turnoId > b.turnoId ? 1 : 0;
  });
}

/** Fusiona por `turnoId`: POST, SSE y relectura pueden traer el mismo turno. */
export function fusionarTurnos(
  actuales: TurnoPendiente[],
  entrantes: TurnoPendiente[],
): TurnoPendiente[] {
  const mapa = new Map(actuales.map((turno) => [turno.turnoId, turno]));
  for (const turno of entrantes) mapa.set(turno.turnoId, turno);
  return ordenarTurnos([...mapa.values()]);
}

/**
 * Aplica un evento del stream del chat. Los tipos desconocidos se ignoran sin
 * tocar la lista: el panel comparte canal con los mensajes (D31).
 */
export function aplicarEventoPropuesta(
  actuales: TurnoPendiente[],
  evento: unknown,
): TurnoPendiente[] {
  if (!evento || typeof evento !== "object") return actuales;
  const tipo = (evento as { tipo?: unknown }).tipo;

  if (tipo === "propuesta.creada") {
    const creada = evento as EventoPropuestaCreada;
    if (!Array.isArray(creada.propuestas) || creada.propuestas.length === 0) return actuales;
    const turno = turnoDesdePropuestas(creada.propuestas);
    if (!turno) return actuales;
    const existente = actuales.some((actual) => actual.turnoId === turno.turnoId);
    if (existente) return fusionarTurnos(actuales, [turno]);
    // Las propuestas ya resueltas no pertenecen al panel de pendientes.
    if (turno.estado !== "pendiente" && turno.estado !== "aprobando") return actuales;
    return fusionarTurnos(actuales, [turno]);
  }

  if (tipo === "propuesta.resuelta") {
    const resuelta = evento as EventoPropuestaResuelta;
    if (!resuelta.turnoId) return actuales;
    return actuales.map((turno) =>
      turno.turnoId === resuelta.turnoId
        ? {
            ...turno,
            estado: resuelta.estado,
            aprobadoPor: resuelta.aprobadoPor ?? turno.aprobadoPor,
            resultado: resuelta.resultado ?? turno.resultado,
            resueltaEn:
              resuelta.estado === "aplicada" ||
              resuelta.estado === "error" ||
              resuelta.estado === "rechazada"
                ? (turno.resueltaEn ?? new Date().toISOString())
                : turno.resueltaEn,
          }
        : turno,
    );
  }

  return actuales;
}
