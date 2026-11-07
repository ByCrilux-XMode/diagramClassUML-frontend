import { IA_STT_MAX_DURACION_MS } from "./config";

/**
 * Utilidades de dictado por voz (STT).
 *
 * El audio se graba en el navegador y se envía al proxy `/api/ia/transcribe`,
 * que a su vez habla con el HF Space `AlexSolizDuran/ia-voztotext`. Mantener
 * aquí la lógica pura permite probar la inserción del texto y la elección de
 * formato sin depender de un navegador.
 */

export const STT_MAX_DURACION_MS = IA_STT_MAX_DURACION_MS;

/** Formatos preferidos, de más a menos compatible con ffmpeg del Space. */
export const STT_MIME_CANDIDATOS = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
] as const;

const EXTENSIONES: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "video/ogg": "ogg",
  "audio/mp4": "m4a",
  "video/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
};

export interface ResultadoDictado {
  texto: string;
  cursor: number;
}

/**
 * Elige el primer `mimeType` que el navegador puede grabar. Se puede inyectar
 * el comprobador para probar la función fuera de un navegador.
 */
export function elegirMimeType(
  soportado?: (tipo: string) => boolean,
): string | undefined {
  const comprobar =
    soportado ??
    ((tipo: string) => {
      if (typeof MediaRecorder === "undefined") return false;
      return typeof MediaRecorder.isTypeSupported === "function"
        ? MediaRecorder.isTypeSupported(tipo)
        : false;
    });

  return STT_MIME_CANDIDATOS.find((tipo) => comprobar(tipo));
}

export function extensionDeMime(mime: string): string {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return EXTENSIONES[base] ?? "webm";
}

export function nombreArchivoAudio(mime: string, ahora = Date.now()): string {
  return `dictado-${ahora}.${extensionDeMime(mime)}`;
}

/**
 * Inserta el dictado en la posición del cursor. Añade un espacio de separación
 * cuando hace falta para no pegar palabras con el texto que ya existía.
 */
export function insertarDictado(
  textoActual: string,
  dictado: string,
  cursor: number,
): ResultadoDictado {
  const limpio = dictado.trim();
  const posicion = Math.max(0, Math.min(Math.trunc(cursor), textoActual.length));
  if (limpio === "") return { texto: textoActual, cursor: posicion };

  const antes = textoActual.slice(0, posicion);
  const despues = textoActual.slice(posicion);
  const prefijo = antes !== "" && !/\s$/.test(antes) ? " " : "";
  const sufijo = despues !== "" && !/^\s/.test(despues) ? " " : "";
  const insertado = `${prefijo}${limpio}${sufijo}`;

  return {
    texto: `${antes}${insertado}${despues}`,
    cursor: antes.length + insertado.length,
  };
}

/** Extrae el texto de la respuesta del proxy (`{ text }`). */
export function leerTextoTranscripcion(datos: unknown): string {
  if (typeof datos !== "object" || datos === null) return "";
  const texto = (datos as Record<string, unknown>).text;
  return typeof texto === "string" ? texto.trim() : "";
}

/** Mensaje legible para un error del proxy o del Space. */
export function mensajeDeErrorTranscripcion(datos: unknown, status: number): string {
  if (typeof datos === "object" && datos !== null) {
    const error = (datos as Record<string, unknown>).error;
    if (typeof error === "string" && error.trim() !== "") return error.trim();
  }

  if (status === 401) return "Tu sesión expiró. Vuelve a iniciar sesión para usar el dictado.";
  if (status === 413) return "El audio es demasiado grande. Graba un mensaje más corto.";
  if (status === 415) return "El formato de audio no es compatible con el servicio de voz.";
  if (status === 422) return "No se detectó voz en la grabación. Intenta hablar más cerca del micrófono.";
  if (status === 429) return "Has alcanzado el límite de uso. Espera un momento y vuelve a intentarlo.";
  if (status === 504) return "El servicio de voz tardó demasiado. Puede estar iniciándose; inténtalo de nuevo.";
  return "No se pudo transcribir el audio. Inténtalo de nuevo.";
}

/**
 * Envía el audio grabado al proxy de Next y devuelve la transcripción.
 * Lanza un `Error` con un mensaje listo para mostrar en la interfaz.
 */
export async function transcribirAudio(
  audio: Blob,
  opciones: { signal?: AbortSignal } = {},
): Promise<string> {
  const formulario = new FormData();
  const nombre = nombreArchivoAudio(audio.type || "audio/webm");
  formulario.append(
    "file",
    new File([audio], nombre, { type: audio.type || "audio/webm" }),
  );

  const respuesta = await fetch("/api/ia/transcribe", {
    method: "POST",
    body: formulario,
    signal: opciones.signal,
    cache: "no-store",
  });

  const datos = (await respuesta.json().catch(() => null)) as unknown;
  if (!respuesta.ok) {
    throw new Error(mensajeDeErrorTranscripcion(datos, respuesta.status));
  }

  const texto = leerTextoTranscripcion(datos);
  if (texto === "") {
    throw new Error("No se detectó voz en la grabación. Intenta hablar más cerca del micrófono.");
  }
  return texto;
}
