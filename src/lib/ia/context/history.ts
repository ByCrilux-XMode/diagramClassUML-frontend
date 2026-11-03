import type { IAChatMessage } from "../types";

/**
 * Entrada mínima del chat que puede convertirse en historial. Se declara aquí
 * para no acoplar el módulo de contexto al store de Zustand.
 */
export interface EntradaHistorial {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Fragmentos que la interfaz usa como relleno y que no deben llegar al modelo. */
const RELLENOS = [
  /^sin respuesta del modelo\.?$/i,
  /^el asistente no respondió/i,
  /^propuesta lista para revisión humana\.?$/i,
  /^se alcanzó el límite de rondas/i,
];

export function esRelleno(contenido: string): boolean {
  const texto = contenido.trim();
  if (texto === "") return true;
  return RELLENOS.some((patron) => patron.test(texto));
}

/**
 * Convierte las entradas visibles del chat en mensajes para el modelo.
 *
 * - excluye `system` (avisos de la interfaz que el modelo leería como propios);
 * - excluye vacíos y marcadores de relleno;
 * - conserva solo los últimos `maxTurnos` turnos, entendidos como bloques que
 *   empiezan en un mensaje `user`.
 */
export function toHistory(entradas: EntradaHistorial[], maxTurnos: number): IAChatMessage[] {
  const utiles = entradas.filter(
    (entrada) => entrada.role !== "system" && !esRelleno(entrada.content),
  );

  const bloques: IAChatMessage[][] = [];
  let actual: IAChatMessage[] = [];
  for (const entrada of utiles) {
    if (entrada.role === "user" && actual.length > 0) {
      bloques.push(actual);
      actual = [];
    }
    actual.push({ role: entrada.role, content: entrada.content });
  }
  if (actual.length > 0) bloques.push(actual);

  const limite = Math.max(1, maxTurnos);
  return bloques.slice(-limite).flat();
}
