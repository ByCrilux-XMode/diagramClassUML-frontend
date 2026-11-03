import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_CARACTERES_PRIVADO,
  MAX_ENTRADAS_PRIVADAS,
  borrarPrivado,
  cargarPrivado,
  clavePrivado,
  guardarPrivado,
} from "./privado";

/** El entorno de pruebas es `node`: se sustituye `window` con un localStorage real. */
function instalarNavegador() {
  const almacenamiento = new Map<string, string>();
  const localStorage = {
    getItem: (clave: string) => almacenamiento.get(clave) ?? null,
    setItem: (clave: string, valor: string) => void almacenamiento.set(clave, valor),
    removeItem: (clave: string) => void almacenamiento.delete(clave),
  };
  (globalThis as { window?: unknown }).window = { localStorage };
  return almacenamiento;
}

describe("persistencia local del chat privado", () => {
  beforeEach(() => {
    instalarNavegador();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("la clave mezcla proyecto y usuario", () => {
    expect(clavePrivado("7", 3)).toBe("ia.privado:7:3");
    expect(clavePrivado(null, 3)).toBeNull();
    expect(clavePrivado("7", null)).toBeNull();
    expect(clavePrivado("7", undefined)).toBeNull();
  });

  it("guarda y recupera el historial", () => {
    const clave = clavePrivado("7", 3);
    expect(guardarPrivado(clave, [{ id: "1" }, { id: "2" }])).toBe(true);
    expect(cargarPrivado<{ id: string }>(clave)).toEqual([{ id: "1" }, { id: "2" }]);
  });

  it("aisla el historial por proyecto y por persona", () => {
    guardarPrivado(clavePrivado("7", 3), [{ id: "de-ana" }]);
    expect(cargarPrivado(clavePrivado("7", 9))).toEqual([]);
    expect(cargarPrivado(clavePrivado("8", 3))).toEqual([]);
    expect(cargarPrivado<{ id: string }>(clavePrivado("7", 3))).toEqual([{ id: "de-ana" }]);
  });

  it("recorta descartando las entradas más antiguas", () => {
    const clave = clavePrivado("7", 3);
    const entradas = Array.from({ length: MAX_ENTRADAS_PRIVADAS + 40 }, (_, i) => ({ id: i }));
    guardarPrivado(clave, entradas);

    const leidas = cargarPrivado<{ id: number }>(clave);
    expect(leidas).toHaveLength(MAX_ENTRADAS_PRIVADAS);
    expect(leidas[0]?.id).toBe(40);
    expect(leidas[leidas.length - 1]?.id).toBe(MAX_ENTRADAS_PRIVADAS + 39);
  });

  it("respeta el tope de caracteres", () => {
    const clave = clavePrivado("7", 3);
    const entradas = Array.from({ length: 60 }, (_, i) => ({ id: i, relleno: "x".repeat(4000) }));
    guardarPrivado(clave, entradas);

    const leidas = cargarPrivado<unknown>(clave);
    expect(leidas.length).toBeLessThan(entradas.length);
    expect(JSON.stringify(leidas).length).toBeLessThanOrEqual(MAX_CARACTERES_PRIVADO);
  });

  it("borra la clave completa", () => {
    const clave = clavePrivado("7", 3);
    guardarPrivado(clave, [{ id: "1" }]);
    borrarPrivado(clave);
    expect(cargarPrivado(clave)).toEqual([]);
  });

  it("fallo de lectura o JSON corrupto devuelve lista vacía", () => {
    const clave = clavePrivado("7", 3);
    window.localStorage.setItem(clave!, "{esto no es json");
    expect(cargarPrivado(clave)).toEqual([]);
    expect(cargarPrivado("clave:inexistente")).toEqual([]);
  });

  it("sin claves no hace nada", () => {
    expect(guardarPrivado(null, [{ id: "1" }])).toBe(false);
    expect(cargarPrivado(null)).toEqual([]);
    expect(() => borrarPrivado(null)).not.toThrow();
  });
});
