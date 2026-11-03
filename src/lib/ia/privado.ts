/**
 * Persistencia local del chat privado con la IA.
 *
 * El chat privado es una libreta de consulta de una sola persona: no se envía
 * al servidor, no se audita y no se comparte con el equipo (decisión 6 y D43
 * del cambio 06-modos-plan-build). Por eso vive en `localStorage`, bajo una
 * clave que mezcla proyecto y usuario.
 *
 * Dos topes: cantidad de entradas y tamaño en caracteres. Al excederlos se
 * descartan las más antiguas, que de todos modos ya no caben en la ventana del
 * modelo.
 */

/** Entradas máximas guardadas por clave. */
export const MAX_ENTRADAS_PRIVADAS = 100;

/** Tamaño máximo por clave, en caracteres de JSON. */
export const MAX_CARACTERES_PRIVADO = 180_000;

function hayNavegador(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Clave del historial privado. `null` si falta proyecto o usuario. */
export function clavePrivado(
  proyectoId: string | null | undefined,
  usuarioId: number | null | undefined,
): string | null {
  if (!proyectoId) return null;
  if (usuarioId === null || usuarioId === undefined) return null;
  return `ia.privado:${proyectoId}:${usuarioId}`;
}

function recortar<T>(entradas: T[]): T[] {
  let lista = entradas;
  if (lista.length > MAX_ENTRADAS_PRIVADAS) {
    lista = lista.slice(lista.length - MAX_ENTRADAS_PRIVADAS);
  }
  while (lista.length > 1) {
    try {
      if (JSON.stringify(lista).length <= MAX_CARACTERES_PRIVADO) break;
    } catch {
      break;
    }
    lista = lista.slice(1);
  }
  return lista;
}

/** Lee el historial privado. Devuelve `[]` ante cualquier fallo. */
export function cargarPrivado<T>(clave: string | null): T[] {
  if (!clave || !hayNavegador()) return [];
  try {
    const crudo = window.localStorage.getItem(clave);
    if (!crudo) return [];
    const parsed: unknown = JSON.parse(crudo);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * Guarda el historial privado recortado. Devuelve `false` si el navegador
 * rechazó la escritura (cuota llena): la conversación sigue visible igual.
 */
export function guardarPrivado<T>(clave: string | null, entradas: T[]): boolean {
  if (!clave || !hayNavegador()) return false;
  try {
    window.localStorage.setItem(clave, JSON.stringify(recortar(entradas)));
    return true;
  } catch {
    return false;
  }
}

/** Borra la clave local. */
export function borrarPrivado(clave: string | null): void {
  if (!clave || !hayNavegador()) return;
  try {
    window.localStorage.removeItem(clave);
  } catch {
    // nada que hacer: la clave no existía o el navegador lo impidió
  }
}
