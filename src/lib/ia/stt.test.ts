import { describe, expect, it } from "vitest";
import {
  elegirMimeType,
  extensionDeMime,
  insertarDictado,
  leerTextoTranscripcion,
  mensajeDeErrorTranscripcion,
  nombreArchivoAudio,
} from "./stt";

describe("elegirMimeType", () => {
  it("prefiere webm con opus", () => {
    expect(elegirMimeType(() => true)).toBe("audio/webm;codecs=opus");
  });

  it("usa el primer formato soportado", () => {
    const soportados = new Set(["audio/ogg;codecs=opus", "audio/mp4"]);
    expect(elegirMimeType((tipo) => soportados.has(tipo))).toBe(
      "audio/ogg;codecs=opus",
    );
  });

  it("devuelve undefined si el navegador no soporta ninguno", () => {
    expect(elegirMimeType(() => false)).toBeUndefined();
  });
});

describe("extensionDeMime", () => {
  it("ignora los parámetros del codec", () => {
    expect(extensionDeMime("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionDeMime("audio/mp4")).toBe("m4a");
  });

  it("cae en webm para formatos desconocidos", () => {
    expect(extensionDeMime("audio/desconocido")).toBe("webm");
  });
});

describe("nombreArchivoAudio", () => {
  it("incluye la extensión correcta", () => {
    expect(nombreArchivoAudio("audio/webm;codecs=opus", 123)).toBe(
      "dictado-123.webm",
    );
  });
});

describe("insertarDictado", () => {
  it("inserta el dictado cuando el campo está vacío", () => {
    expect(insertarDictado("", "hola mundo", 0)).toEqual({
      texto: "hola mundo",
      cursor: 10,
    });
  });

  it("añade espacios al insertar en medio de dos palabras", () => {
    expect(insertarDictado("hola mundo", "gran", 5)).toEqual({
      texto: "hola gran mundo",
      cursor: 10,
    });
  });

  it("no duplica espacios existentes", () => {
    expect(insertarDictado("hola ", "mundo", 5)).toEqual({
      texto: "hola mundo",
      cursor: 10,
    });
  });

  it("normaliza el dictado y respeta el final del texto", () => {
    expect(insertarDictado("hola", "  mundo  ", 4)).toEqual({
      texto: "hola mundo",
      cursor: 10,
    });
  });

  it("no modifica el texto si el dictado está vacío", () => {
    expect(insertarDictado("hola", "   ", 2)).toEqual({
      texto: "hola",
      cursor: 2,
    });
  });

  it("acota el cursor a los límites del texto", () => {
    expect(insertarDictado("hola", "mundo", 999)).toEqual({
      texto: "hola mundo",
      cursor: 10,
    });
    expect(insertarDictado("hola", "mundo", -5)).toEqual({
      texto: "mundo hola",
      cursor: 6,
    });
  });
});

describe("leerTextoTranscripcion", () => {
  it("lee y recorta el campo text", () => {
    expect(leerTextoTranscripcion({ text: "  hola  " })).toBe("hola");
  });

  it("devuelve vacío si no hay texto", () => {
    expect(leerTextoTranscripcion({ error: "fallo" })).toBe("");
    expect(leerTextoTranscripcion(null)).toBe("");
    expect(leerTextoTranscripcion("texto")).toBe("");
  });
});

describe("mensajeDeErrorTranscripcion", () => {
  it("prioriza el mensaje del servidor", () => {
    expect(
      mensajeDeErrorTranscripcion({ error: "No se detectó voz" }, 500),
    ).toBe("No se detectó voz");
  });

  it("traduce los estados conocidos", () => {
    expect(mensajeDeErrorTranscripcion(null, 413)).toMatch(/demasiado grande/);
    expect(mensajeDeErrorTranscripcion(null, 415)).toMatch(/no es compatible/);
    expect(mensajeDeErrorTranscripcion(null, 422)).toMatch(/No se detectó voz/);
    expect(mensajeDeErrorTranscripcion(null, 429)).toMatch(/límite/);
    expect(mensajeDeErrorTranscripcion(null, 504)).toMatch(/tardó demasiado/);
  });

  it("usa un mensaje genérico para el resto", () => {
    expect(mensajeDeErrorTranscripcion(null, 500)).toMatch(
      /No se pudo transcribir/,
    );
  });
});
