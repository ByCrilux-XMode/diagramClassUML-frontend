/**
 * Parser de la salida del modelo de visión.
 *
 * El modelo puede envolver el JSON en markdown, agregar texto antes/después,
 * dejar comas finales o —lo más común con diagramas grandes— truncar la
 * respuesta a mitad de objeto. `extraerJson` (compartido con el DSL) cubre los
 * dos primeros casos; `cerrarJsonTruncado` cierra las estructuras que hayan
 * quedado abiertas.
 */
import { extraerJson } from "./dsl/repair";

/**
 * Cierra las llaves/corchetes (y la cadena) que quedaron abiertos al
 * truncarse la respuesta. Devuelve `null` si el texto no tiene un `{`.
 *
 * No inventa contenido: solo completa los cierres que faltan. Si el corte
 * dejó un valor a medias, el JSON resultante puede seguir siendo inválido y
 * `parseVisionJson` devuelve `null`; el error de zod mostrará el detalle.
 */
export function cerrarJsonTruncado(texto: string): string | null {
  const inicio = texto.indexOf("{");
  if (inicio === -1) return null;

  const cuerpo = texto.slice(inicio);
  const pila: string[] = [];
  let enCadena = false;
  let escapado = false;

  for (const caracter of cuerpo) {
    if (enCadena) {
      if (escapado) escapado = false;
      else if (caracter === "\\") escapado = true;
      else if (caracter === '"') enCadena = false;
      continue;
    }
    if (caracter === '"') enCadena = true;
    else if (caracter === "{") pila.push("}");
    else if (caracter === "[") pila.push("]");
    else if (caracter === "}" || caracter === "]") pila.pop();
  }

  let salida = cuerpo;
  if (enCadena) {
    // Si el corte cayó dentro de una cadena con escape pendiente, se cierra
    // el escape antes de la comilla (si no, la comilla quedaría escapada).
    if (escapado) salida += "\\";
    salida += '"';
  } else {
    // Una coma o dos puntos finales no son válidos antes de cerrar.
    salida = salida.replace(/[,:]\s*$/, "");
  }
  return salida + pila.reverse().join("");
}

/**
 * Convierte el `content` crudo del modelo en un valor JSON.
 * @returns El valor parseado o `null` si no hay JSON recuperable.
 */
export function parseVisionJson(raw: string): unknown {
  const texto = (raw ?? "").trim();
  if (!texto) return null;

  // 1) Caso habitual: fences markdown, comas finales, texto alrededor.
  const extraido = extraerJson(texto);
  if (extraido !== null) return extraido;

  // 2) Respuesta truncada por el tope de tokens: se cierran estructuras.
  const reparado = cerrarJsonTruncado(texto);
  if (reparado) {
    try {
      return JSON.parse(reparado) as unknown;
    } catch {
      // ni cerrando llaves es JSON válido
    }
  }
  return null;
}
