import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorProxy, mensajeDeErrorIA, solicitarChat } from "./proxy";

const body = {
  provider: "openrouter" as const,
  model: "modelo/x",
  messages: [{ role: "user" as const, content: "hola" }],
  tools: [],
};

function respuesta(status: number, datos: unknown, retryAfter?: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (nombre: string) => (nombre === "Retry-After" ? retryAfter ?? null : null) },
    json: async () => datos,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("solicitarChat · errores de sesión y servicio", () => {
  it("un 401 se clasifica como sesión, no como 4xx del proveedor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(401, { error: "Tu sesión venció." })));

    await expect(solicitarChat(body)).rejects.toMatchObject({
      motivo: "sesion",
      status: 401,
    });
  });

  it("un 503 se clasifica como servicio de autenticación no disponible", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(503, { error: "Backend caído." })));

    await expect(solicitarChat(body)).rejects.toMatchObject({
      motivo: "servicio",
      status: 503,
    });
  });

  it("un 502 del proveedor sigue siendo 5xx reintentable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(502, { error: "Proveedor caído." })));

    await expect(solicitarChat(body)).rejects.toMatchObject({ motivo: "5xx", status: 502 });
  });

  it("conserva Retry-After en un 429", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(429, { error: "límite" }, "7")));

    await expect(solicitarChat(body)).rejects.toMatchObject({
      motivo: "429",
      retryAfterMs: 7000,
    });
  });
});

describe("mensajeDeErrorIA", () => {
  it("distingue sesión vencida, servicio caído y límite", () => {
    expect(mensajeDeErrorIA(new ErrorProxy("sesion", "401", 401))).toBe(
      "Tu sesión venció. Vuelve a iniciar sesión para usar el asistente.",
    );
    expect(mensajeDeErrorIA(new ErrorProxy("servicio", "503", 503))).toBe(
      "El servicio de autenticación no está disponible. Inténtalo de nuevo en unos segundos.",
    );
    expect(mensajeDeErrorIA(new ErrorProxy("429", "límite", 429, 12_000))).toBe(
      "Has alcanzado el límite de uso del asistente. Espera 12 s y vuelve a intentarlo.",
    );
  });

  it("mantiene el mensaje genérico para fallos del proveedor", () => {
    expect(mensajeDeErrorIA(new ErrorProxy("5xx", "caído"))).toBe(
      "El asistente no respondió: caído",
    );
    expect(mensajeDeErrorIA(new Error("sin red"))).toBe("El asistente no respondió: sin red");
  });
});
