/**
 * La mención `@ia` cuenta solo como palabra completa.
 *
 * No coincide con `@ian`, con correos como `ana@ia.com` ni con texto pegado.
 * Varias menciones en un mensaje producen una sola invocación.
 */
const MENCION = /(?:^|[^\p{L}\p{N}_])@ia(?![\p{L}\p{N}_])/iu;

export function mencionaIA(texto: string): boolean {
  return MENCION.test(texto);
}

/**
 * Inserta `@ia ` en la posición del cursor. Si ya hay una mención, devuelve el
 * texto sin cambios para no duplicarla.
 */
export function insertarMencion(
  texto: string,
  cursor: number,
): { texto: string; cursor: number } {
  if (mencionaIA(texto)) return { texto, cursor };
  const posicion = Math.min(Math.max(cursor, 0), texto.length);
  const antes = texto.slice(0, posicion);
  const despues = texto.slice(posicion);
  const separador = antes.length > 0 && !/\s$/.test(antes) ? " " : "";
  const insercion = `${separador}@ia `;
  return { texto: `${antes}${insercion}${despues}`, cursor: posicion + insercion.length };
}
