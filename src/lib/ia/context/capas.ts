/**
 * Definición de las seis capas del contexto (D45).
 *
 * Los topes son tokens estimados, no bytes. `prioridad` se usa para el recorte:
 * 1 es la capa que más se conserva. La capa 1 es obligatoria y nunca se recorta.
 */
export type IdCapa = 1 | 2 | 3 | 4 | 5 | 6;

export interface DefinicionCapa {
  id: IdCapa;
  nombre: string;
  tope: number;
  prioridad: number;
  obligatoria?: boolean;
}

export const CAPAS: readonly DefinicionCapa[] = [
  { id: 1, nombre: "Rol y modo", tope: 300, prioridad: 0, obligatoria: true },
  { id: 2, nombre: "Estado del diagrama", tope: 3_000, prioridad: 1 },
  { id: 3, nombre: "Colaboradores", tope: 300, prioridad: 5 },
  { id: 4, nombre: "Actividad reciente", tope: 1_500, prioridad: 4 },
  { id: 5, nombre: "Conversación y resumen", tope: 2_000, prioridad: 3 },
  { id: 6, nombre: "Plan vigente", tope: 400, prioridad: 2 },
];

export function capaPorId(id: IdCapa): DefinicionCapa {
  const capa = CAPAS.find((definicion) => definicion.id === id);
  if (!capa) throw new Error(`Capa de contexto desconocida: ${id}`);
  return capa;
}

/** Orden en que se vacían las capas cuando el presupuesto no alcanza. */
export const ORDEN_RECORTE: readonly IdCapa[] = [4, 3, 5, 6, 2];
