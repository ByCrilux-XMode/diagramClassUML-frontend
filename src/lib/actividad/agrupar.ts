import type { EventoActividad } from "./cliente";

export type TipoFilaActividad<T extends EventoActividad = EventoActividad> =
  | { tipo: "evento"; evento: T }
  | { tipo: "grupo"; turnoId: string; eventos: T[] };

/**
 * Agrupa por `turnoId` solo cuando el turno tiene más de un evento.
 *
 * Una edición humana produce un evento suelto y se pinta como fila normal. Un
 * turno de la IA puede producir varias transacciones (confirmación de la vista
 * previa más cada tool no visual); esas sí se pliegan.
 */
export function agruparEventos<T extends EventoActividad>(eventos: T[]): TipoFilaActividad<T>[] {
  const filas: TipoFilaActividad<T>[] = [];
  const porTurno = new Map<string, T[]>();

  for (const evento of eventos) {
    if (evento.turnoId) {
      const lista = porTurno.get(evento.turnoId) ?? [];
      lista.push(evento);
      porTurno.set(evento.turnoId, lista);
    }
  }

  const emitidos = new Set<string>();
  for (const evento of eventos) {
    const turnoId = evento.turnoId;
    if (!turnoId) {
      filas.push({ tipo: "evento", evento });
      continue;
    }
    const lista = porTurno.get(turnoId) ?? [];
    if (lista.length <= 1) {
      filas.push({ tipo: "evento", evento });
      continue;
    }
    if (emitidos.has(turnoId)) continue;
    emitidos.add(turnoId);
    // Se conserva el orden de la lista, que llega del más reciente al más antiguo.
    const ordenados = [...lista].sort((a, b) => {
      const fechaA = a.ocurridoEn ? new Date(a.ocurridoEn).getTime() : 0;
      const fechaB = b.ocurridoEn ? new Date(b.ocurridoEn).getTime() : 0;
      if (fechaA !== fechaB) return fechaA - fechaB;
      return a.secuencia - b.secuencia;
    });
    filas.push({ tipo: "grupo", turnoId, eventos: ordenados });
  }

  return filas;
}
