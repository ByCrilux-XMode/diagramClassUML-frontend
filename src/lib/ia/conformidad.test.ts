import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONFORMIDAD_TTL_MS,
  clasificarConformidad,
  formatearConformidad,
  guardarConformidadCache,
  invalidarConformidad,
  leerConformidadCache,
  probarConformidad,
} from "./conformidad";
import type { IAProvider, IAToolCall } from "./types";

const mocks = vi.hoisted(() => ({ solicitarChat: vi.fn() }));

vi.mock("./proxy", () => ({
  solicitarChat: mocks.solicitarChat,
  sanitizarMensaje: (mensaje: string) => mensaje.replace(/sk-[A-Za-z0-9]+/g, "[redactado]"),
}));

const nativa: IAToolCall = {
  id: "c1",
  type: "function",
  function: { name: "addClass", arguments: JSON.stringify({ key: "a", name: "A" }) },
};

function almacen() {
  const datos = new Map<string, string>();
  const sessionStorage = {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => void datos.set(clave, valor),
    removeItem: (clave: string) => void datos.delete(clave),
  };
  (globalThis as { window?: unknown }).window = { sessionStorage };
  return datos;
}

beforeAll(() => {
  almacen();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("clasificarConformidad", () => {
  it("verde cuando llega un tool_call nativo del registry", () => {
    const resultado = clasificarConformidad({
      proveedor: "openrouter",
      modelo: "modelo/x",
      toolCalls: [nativa],
      content: "",
    });

    expect(resultado.estado).toBe("verde");
    expect(resultado.detalle).toContain("addClass");
  });

  it("amarillo cuando el parser recupera una tool del texto", () => {
    const resultado = clasificarConformidad({
      proveedor: "hf-space",
      modelo: "modelo/y",
      toolCalls: [],
      content: `Haré el cambio: ${JSON.stringify({ name: "addClass", arguments: { key: "a", name: "A" } })}`,
    });

    expect(resultado.estado).toBe("amarillo");
    expect(resultado.detalle).toContain("parser de texto");
  });

  it("rojo cuando no hay ninguna herramienta válida", () => {
    const resultado = clasificarConformidad({
      proveedor: "hf-space",
      modelo: "modelo/z",
      toolCalls: [],
      content: "No puedo hacer eso.",
    });

    expect(resultado.estado).toBe("rojo");
  });
});

describe("probabilidad de conformidad", () => {
  it("lanza la sonda, clasifica y cachea el resultado", async () => {
    const almacenamiento = almacen();
    mocks.solicitarChat.mockResolvedValue({ content: "", toolCalls: [nativa] });

    const primera = await probarConformidad({
      proveedor: "openrouter",
      modelo: "modelo/cache",
      ahora: 1_000,
    });
    const segunda = await probarConformidad({
      proveedor: "openrouter",
      modelo: "modelo/cache",
      ahora: 2_000,
    });

    expect(primera.estado).toBe("verde");
    expect(segunda).toEqual(primera);
    expect(mocks.solicitarChat).toHaveBeenCalledTimes(1);
    expect(almacenamiento.size).toBeGreaterThan(0);
  });

  it("la caché caduca a los 10 minutos", async () => {
    mocks.solicitarChat.mockResolvedValue({ content: "", toolCalls: [nativa] });

    const resultado = await probarConformidad({
      proveedor: "hf-space",
      modelo: "modelo/caduca",
      ahora: 1_000,
    });

    expect(
      leerConformidadCache("hf-space", "modelo/caduca", 1_000 + CONFORMIDAD_TTL_MS + 1),
    ).toBeNull();

    await probarConformidad({
      proveedor: "hf-space",
      modelo: "modelo/caduca",
      ahora: 1_000 + CONFORMIDAD_TTL_MS + 2,
    });
    expect(mocks.solicitarChat).toHaveBeenCalledTimes(2);
    expect(resultado.estado).toBe("verde");
  });

  it("forzar ignora la caché", async () => {
    mocks.solicitarChat.mockResolvedValue({ content: "", toolCalls: [nativa] });

    await probarConformidad({ proveedor: "openrouter", modelo: "modelo/forzar", ahora: 1 });
    await probarConformidad({
      proveedor: "openrouter",
      modelo: "modelo/forzar",
      ahora: 2,
      forzar: true,
    });

    expect(mocks.solicitarChat).toHaveBeenCalledTimes(2);
  });

  it("un error de la sonda queda en rojo y no lanza", async () => {
    mocks.solicitarChat.mockRejectedValue(new Error("401 con sk-secreto123"));

    const resultado = await probarConformidad({
      proveedor: "huggingface",
      modelo: "modelo/error",
      ahora: 1,
    });

    expect(resultado.estado).toBe("rojo");
    expect(resultado.detalle).toContain("La sonda falló");
    expect(resultado.detalle).not.toContain("sk-secreto123");
  });

  it("invalidar borra la entrada del modelo", () => {
    const resultado = clasificarConformidad({
      proveedor: "openrouter",
      modelo: "modelo/invalidar",
      toolCalls: [nativa],
      content: "",
      probadoEn: new Date(1).toISOString(),
    });
    guardarConformidadCache(resultado);
    expect(leerConformidadCache("openrouter", "modelo/invalidar", 2)).not.toBeNull();

    invalidarConformidad("openrouter", "modelo/invalidar");

    expect(leerConformidadCache("openrouter", "modelo/invalidar", 2)).toBeNull();
  });
});

describe("formatearConformidad", () => {
  it("traduce los tres estados y el no probado", () => {
    const base = { proveedor: "openrouter" as IAProvider, modelo: "x", probadoEn: "" };
    expect(formatearConformidad({ ...base, estado: "verde", detalle: "d" }).etiqueta).toBe("Edita");
    expect(formatearConformidad({ ...base, estado: "amarillo", detalle: "d" }).etiqueta).toBe(
      "Edita por texto",
    );
    expect(formatearConformidad({ ...base, estado: "rojo", detalle: "d" }).etiqueta).toBe(
      "Solo consulta",
    );
    expect(formatearConformidad(null).etiqueta).toBe("Sin probar");
  });
});
