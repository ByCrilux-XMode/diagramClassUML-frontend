/**
 * Arriendo del turno en el servidor. Debe coincidir con
 * `ARRIENDO_PROPUESTA_MS` del backend: si el navegador que reclamó desaparece,
 * otro EDITOR puede reintentar cuando vence.
 */
export const ARRIENDO_PROPUESTA_MS = 60_000;
