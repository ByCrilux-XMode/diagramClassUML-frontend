/**
 * Extracción y reparación de la salida del modelo.
 *
 * El Space no soporta JSON mode ni gramáticas: el modelo puede envolver el
 * objeto en markdown, agregar texto antes/después o dejar comas finales.
 * Este módulo intenta rescatar el primer objeto JSON balanceado.
 */

/** Quita bloques markdown, comas finales y caracteres invisibles. */
function limpiar(texto: string): string {
  return texto
    .replace(/\uFEFF/g, "")
    .replace(/```(?:json|javascript|js)?/gi, "")
    .replace(/```/g, "")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

/**
 * Devuelve el primer objeto `{...}` balanceado del texto, respetando cadenas.
 * No intenta reparar JSON truncado: si no hay cierre, devuelve null.
 */
export function primerObjetoBalanceado(texto: string): string | null {
  const inicio = texto.indexOf("{");
  if (inicio === -1) return null;

  let profundidad = 0;
  let enCadena = false;
  let escapado = false;

  for (let i = inicio; i < texto.length; i += 1) {
    const caracter = texto[i];
    if (enCadena) {
      if (escapado) escapado = false;
      else if (caracter === "\\") escapado = true;
      else if (caracter === '"') enCadena = false;
      continue;
    }
    if (caracter === '"') enCadena = true;
    else if (caracter === "{") profundidad += 1;
    else if (caracter === "}") {
      profundidad -= 1;
      if (profundidad === 0) return texto.slice(inicio, i + 1);
    }
  }
  return null;
}

/**
 * Extrae todos los objetos balanceados de un texto. Se usa para localizar el
 * snapshot del diagrama dentro del system prompt.
 */
export function objetosBalanceados(texto: string): string[] {
  const objetos: string[] = [];
  let desde = 0;
  while (desde < texto.length) {
    const inicio = texto.indexOf("{", desde);
    if (inicio === -1) break;
    const bloque = primerObjetoBalanceado(texto.slice(inicio));
    if (!bloque) break;
    objetos.push(bloque);
    desde = inicio + bloque.length;
  }
  return objetos;
}

/**
 * Extrae el objeto JSON de la respuesta del modelo.
 * @returns El valor parseado o null si no hay JSON válido.
 */
export function extraerJson(texto: string): unknown | null {
  const limpio = limpiar(texto ?? "");
  if (limpio === "") return null;

  // 1) Objeto balanceado (lo habitual).
  const objeto = primerObjetoBalanceado(limpio);
  if (objeto) {
    try {
      return JSON.parse(objeto) as unknown;
    } catch {
      // Puede haber comas finales anidadas; se reintenta tras limpiar.
      try {
        return JSON.parse(limpiar(objeto)) as unknown;
      } catch {
        // sigue abajo
      }
    }
  }

  // 2) Todo el texto como JSON (por si viene sin llaves externas).
  try {
    return JSON.parse(limpio) as unknown;
  } catch {
    return null;
  }
}
