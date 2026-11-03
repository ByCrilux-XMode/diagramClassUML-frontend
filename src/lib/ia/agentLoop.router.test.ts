import { afterEach, describe, expect, it, vi } from "vitest";
import { runAgentLoop } from "./agentLoop";
import type { TramoProveedor } from "./router";

/**
 * D62: el loop reporta el tramo que respondió, no el que estaba elegido, y las
 * propuestas conservan ese modelo para cuando se aprueben en otro navegador.
 */

const cadena: TramoProveedor[] = [
  { proveedor: "openrouter", modelo: "modelo/or" },
  { proveedor: "hf-space", modelo: "modelo/hf" },
];

function respuesta(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

function params() {
  return {
    cadena,
    systemPrompt: "Eres un asistente UML.",
    userMessage: "crea la clase Pedido",
    ambito: "grupo" as const,
    modo: "build" as const,
    rol: "EDITOR" as const,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("trazabilidad del proveedor en el loop", () => {
  it("reporta el tramo de respaldo y los intentos fallidos", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respuesta(500, { error: "caído" }))
      .mockResolvedValueOnce(respuesta(500, { error: "caído" }))
      .mockResolvedValueOnce(respuesta(200, { content: "Listo.", toolCalls: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await runAgentLoop({ ...params(), modo: "plan", rol: "LECTOR" });

    expect(resultado.finalContent).toBe("Listo.");
    expect(resultado.proveedorUsado).toBe("hf-space");
    expect(resultado.modeloUsado).toBe("modelo/hf");
    expect(resultado.fallbacks).toEqual([
      { proveedor: "openrouter", modelo: "modelo/or", motivo: "5xx" },
      { proveedor: "openrouter", modelo: "modelo/or", motivo: "5xx" },
    ]);
    const cuerpos = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String((init as { body?: string }).body)),
    ) as Array<{ provider: string }>;
    expect(cuerpos.map((cuerpo) => cuerpo.provider)).toEqual([
      "openrouter",
      "openrouter",
      "hf-space",
    ]);
  });

  it("la propuesta conserva proveedor y modelo que la produjeron", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        respuesta(200, {
          content: "Voy a crear la clase.",
          toolCalls: [
            {
              id: "c1",
              type: "function",
              function: {
                name: "addClass",
                arguments: JSON.stringify({ key: "pedido", name: "Pedido" }),
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(respuesta(200, { content: "Propuesta lista.", toolCalls: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await runAgentLoop(params());

    expect(resultado.pendingProposals).toHaveLength(1);
    expect(resultado.pendingProposals?.[0]).toMatchObject({
      proveedor: "openrouter",
      modelo: "modelo/or",
    });
    expect(resultado.proveedorUsado).toBe("openrouter");
    expect(resultado.modeloUsado).toBe("modelo/or");
    expect(resultado.fallbacks).toBeUndefined();
  });
});
