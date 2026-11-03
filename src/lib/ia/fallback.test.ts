import { afterEach, describe, expect, it, vi } from "vitest";
import { chatConFallback } from "./fallback";
import { ErrorProxy } from "./proxy";
import type { EventoIntento } from "./fallback";
import type { TramoProveedor } from "./router";

const cadena: TramoProveedor[] = [
  { proveedor: "openrouter", modelo: "modelo/or" },
  { proveedor: "hf-space", modelo: "modelo/hf" },
];

interface Cuerpo {
  provider: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  tools: unknown[];
}

function respuesta(status: number, body: unknown, retryAfter?: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (nombre: string) => (nombre === "Retry-After" ? retryAfter ?? null : null) },
    json: async () => body,
  };
}

function ok(content = "listo") {
  return respuesta(200, { content, toolCalls: [] });
}

function preparar(tramo: TramoProveedor) {
  return {
    messages: [{ role: "user" as const, content: `preparado-${tramo.proveedor}` }],
    tools: [] as [],
    contexto: { tramo: tramo.proveedor },
  };
}

function sinEspera() {
  return Promise.resolve();
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("chatConFallback", () => {
  it("responde con el primer tramo sin fallbacks", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: { body?: string }) => ok("primera"));
    vi.stubGlobal("fetch", fetchMock);
    const intentos: EventoIntento[] = [];

    const resultado = await chatConFallback({
      cadena,
      preparar,
      esperar: sinEspera,
      onIntento: (evento) => intentos.push(evento),
    });

    expect(resultado.content).toBe("primera");
    expect(resultado.proveedorUsado).toBe("openrouter");
    expect(resultado.modeloUsado).toBe("modelo/or");
    expect(resultado.fallbacks).toEqual([]);
    expect(intentos).toHaveLength(1);
    const cuerpo = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Cuerpo;
    expect(cuerpo.provider).toBe("openrouter");
    expect(cuerpo.messages[0]?.content).toBe("preparado-openrouter");
  });

  it("reintenta una vez el mismo tramo ante 429 respetando Retry-After", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respuesta(429, { error: "rate limit" }, "1"))
      .mockResolvedValueOnce(ok("segunda"));
    vi.stubGlobal("fetch", fetchMock);
    const esperas: number[] = [];

    const resultado = await chatConFallback({
      cadena: [cadena[0]!],
      preparar,
      esperar: async (ms) => {
        esperas.push(ms);
      },
    });

    expect(resultado.content).toBe("segunda");
    expect(resultado.proveedorUsado).toBe("openrouter");
    expect(resultado.fallbacks).toEqual([
      { proveedor: "openrouter", modelo: "modelo/or", motivo: "429" },
    ]);
    expect(esperas).toEqual([1000]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("si Retry-After supera el tope, pasa al siguiente tramo sin esperar", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respuesta(429, { error: "rate limit" }, "30"))
      .mockResolvedValueOnce(ok("respaldo"));
    vi.stubGlobal("fetch", fetchMock);
    const esperar = vi.fn(sinEspera);

    const resultado = await chatConFallback({ cadena, preparar, esperar });

    expect(resultado.proveedorUsado).toBe("hf-space");
    expect(esperar).not.toHaveBeenCalled();
    expect(resultado.fallbacks[0]?.motivo).toBe("429");
  });

  it("ante 5xx reintenta y cae al segundo tramo si el primero no se recupera", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respuesta(500, { error: "caído" }))
      .mockResolvedValueOnce(respuesta(502, { error: "caído" }))
      .mockResolvedValueOnce(ok("respaldo"));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await chatConFallback({ cadena, preparar, esperar: sinEspera });

    expect(resultado.proveedorUsado).toBe("hf-space");
    expect(resultado.modeloUsado).toBe("modelo/hf");
    expect(resultado.fallbacks.map((fallback) => fallback.motivo)).toEqual(["5xx", "5xx"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("clasifica el timeout y pasa al respaldo", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      )
      .mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      )
      .mockResolvedValueOnce(ok("respaldo"));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await chatConFallback({
      cadena,
      preparar,
      esperar: sinEspera,
      timeoutIntentoMs: 5,
      timeoutTotalMs: 5000,
    });

    expect(resultado.proveedorUsado).toBe("hf-space");
    expect(resultado.fallbacks[0]).toEqual({
      proveedor: "openrouter",
      modelo: "modelo/or",
      motivo: "timeout",
    });
  });

  it("un 401 no se reintenta ni cambia de tramo", async () => {
    const fetchMock = vi.fn(async () => respuesta(401, { error: "sin credenciales" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatConFallback({ cadena, preparar, esperar: sinEspera })).rejects.toBeInstanceOf(
      ErrorProxy,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, "sesion"],
    [503, "servicio"],
  ])("un %i corta la cadena sin reintentar ni cambiar de tramo", async (status, motivo) => {
    const fetchMock = vi.fn(async () => respuesta(status, { error: "no disponible" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      chatConFallback({ cadena, preparar, esperar: sinEspera }),
    ).rejects.toMatchObject({ motivo });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([400, 403, 404])("un %i de petición no se reintenta", async (status) => {
    const fetchMock = vi.fn(async () => respuesta(status, { error: "petición inválida" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatConFallback({ cadena, preparar, esperar: sinEspera })).rejects.toMatchObject({
      motivo: "4xx",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("un abort de la persona corta sin fallback", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promesa = chatConFallback({
      cadena,
      preparar,
      esperar: sinEspera,
      signal: controller.signal,
    });
    controller.abort();

    await expect(promesa).rejects.toMatchObject({ motivo: "abort" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("el tope total corta la cadena aunque queden tramos", async () => {
    let reloj = 0;
    const fetchMock = vi.fn(async () => respuesta(500, { error: "caído" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      chatConFallback({
        cadena,
        preparar,
        ahora: () => reloj,
        esperar: async (ms) => {
          reloj += ms;
        },
        timeoutTotalMs: 100,
        timeoutIntentoMs: 200,
      }),
    ).rejects.toThrow(/Se agotó el tiempo del turno de IA/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recalcula el presupuesto por intento y conserva el del que respondió", async () => {
    const prepararMock = vi.fn((tramo: TramoProveedor) => ({
      messages: [{ role: "user" as const, content: `presupuesto-${tramo.proveedor}` }],
      tools: [] as [],
      contexto: { ventana: tramo.proveedor === "openrouter" ? 131072 : 4096 },
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respuesta(500, { error: "caído" }))
      .mockResolvedValueOnce(respuesta(500, { error: "caído" }))
      .mockResolvedValueOnce(ok("respaldo"));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await chatConFallback({
      cadena,
      preparar: prepararMock,
      esperar: sinEspera,
    });

    expect(prepararMock.mock.calls.map(([tramo]) => tramo.proveedor)).toEqual([
      "openrouter",
      "openrouter",
      "hf-space",
    ]);
    expect(resultado.intento.contexto).toEqual({ ventana: 4096 });
    const ultimoCuerpo = JSON.parse(
      String(fetchMock.mock.calls[2]?.[1]?.body),
    ) as Cuerpo;
    expect(ultimoCuerpo.provider).toBe("hf-space");
    expect(ultimoCuerpo.messages[0]?.content).toBe("presupuesto-hf-space");
  });

  it("enumera los intentos fallidos sin exponer credenciales", async () => {
    const fetchMock = vi.fn(async () =>
      respuesta(500, { error: "falló con Bearer sk-secreto1234567890" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const promesa = chatConFallback({ cadena, preparar, esperar: sinEspera });
    await expect(promesa).rejects.toThrow(
      /Ningún proveedor de la cadena respondió\. Intentos: openrouter: 5xx, openrouter: 5xx, hf-space: 5xx, hf-space: 5xx/,
    );
    await expect(promesa).rejects.not.toThrow(/sk-secreto/);
  });

  it("una cadena vacía no envía ninguna petición", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatConFallback({ cadena: [], preparar })).rejects.toThrow(/cadena de proveedores está vacía/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
