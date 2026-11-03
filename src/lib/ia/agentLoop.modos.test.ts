import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentLoop } from "./agentLoop";
import type { IAProvider } from "./types";

/**
 * El candado del loop (D36): una herramienta de escritura que llegue por el
 * parser de fallback no se ejecuta ni se propone cuando el turno no es de
 * edición.
 */

interface Llamada {
  provider: IAProvider;
  model: string;
  messages: unknown[];
  tools: Array<{ function: { name: string } }>;
}

function instalarProxy(herramienta: { name: string; arguments: string } | null) {
  const llamadas: Llamada[] = [];
  let ronda = 0;
  const fetchMock = vi.fn(async (_url: unknown, init?: { body?: string }) => {
    const cuerpo = JSON.parse(init?.body ?? "{}") as Llamada;
    llamadas.push(cuerpo);
    ronda += 1;
    const toolCalls =
      herramienta && ronda === 1
        ? [{ id: "c1", type: "function" as const, function: herramienta }]
        : [];
    return {
      ok: true,
      json: async () => ({ content: ronda === 1 ? "Voy a editar." : "Listo.", toolCalls }),
    };
  });
  vi.stubGlobal("fetch", fetchMock);
  return llamadas;
}

function paramsBase() {
  return {
    cadena: [{ proveedor: "openrouter" as IAProvider, modelo: "modelo/de-prueba" }],
    systemPrompt: "Eres un asistente UML.",
    userMessage: "crea la clase Pedido",
  };
}

const addClass = {
  name: "addClass",
  arguments: JSON.stringify({ key: "pedido", name: "Pedido" }),
};

describe("candado de herramientas del loop", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("en modo plan rechaza una tool de escritura del parser de fallback", async () => {
    const llamadas = instalarProxy(addClass);

    const result = await runAgentLoop({
      ...paramsBase(),
      ambito: "grupo",
      modo: "plan",
      rol: "EDITOR",
    });

    expect(result.pendingProposals).toBeUndefined();
    expect(result.hitlRequired).toBe(false);
    const fallo = result.trace.find((t) => t.toolName === "addClass");
    expect(fallo?.ok).toBe(false);
    expect(fallo?.error).toContain("Herramienta no disponible en modo plan");
    // El modelo recibió el error y en la segunda ronda no volvió a pedirlo.
    expect(llamadas).toHaveLength(2);
  });

  it("en el ámbito privado con modo build guardado no se edita", async () => {
    instalarProxy(addClass);

    const result = await runAgentLoop({
      ...paramsBase(),
      ambito: "privado",
      modo: "build",
      rol: "CREADOR",
    });

    expect(result.pendingProposals).toBeUndefined();
    expect(result.trace.find((t) => t.toolName === "addClass")?.ok).toBe(false);
  });

  it("en grupo + build + EDITOR la tool de escritura se propone (HITL)", async () => {
    const llamadas = instalarProxy(addClass);

    const result = await runAgentLoop({
      ...paramsBase(),
      ambito: "grupo",
      modo: "build",
      rol: "EDITOR",
    });

    expect(result.pendingProposals).toHaveLength(1);
    expect(result.pendingProposals?.[0]?.toolName).toBe("addClass");
    expect(result.hitlRequired).toBe(true);
    // Solo se ofreció el set completo: nada se ejecutó.
    expect(llamadas[0]?.tools.some((t) => t.function.name === "addClass")).toBe(true);
  });

  it("un LECTOR en grupo + build no recibe herramientas de escritura", async () => {
    const llamadas = instalarProxy(addClass);

    const result = await runAgentLoop({
      ...paramsBase(),
      ambito: "grupo",
      modo: "build",
      rol: "LECTOR",
    });

    expect(llamadas[0]?.tools.some((t) => t.function.name === "addClass")).toBe(false);
    expect(result.pendingProposals).toBeUndefined();
    expect(result.trace.find((t) => t.toolName === "addClass")?.ok).toBe(false);
  });

  it("una herramienta de solo lectura sigue ofreciéndose en modo plan", async () => {
    const llamadas = instalarProxy({
      name: "getState",
      arguments: JSON.stringify({}),
    });

    await runAgentLoop({
      ...paramsBase(),
      ambito: "grupo",
      modo: "plan",
      rol: "LECTOR",
    });

    expect(llamadas[0]?.tools.some((t) => t.function.name === "getState")).toBe(true);
  });
});
