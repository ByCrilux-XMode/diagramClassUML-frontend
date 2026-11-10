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

  it("en HITL permite varias rondas pero no duplica propuestas", async () => {
    // Un modelo débil puede devolver la misma tool en cada ronda: el resultado
    // `{ok:true, proposed:true}` no confirma la escritura, así que insiste.
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: "Voy a editar.",
        toolCalls: [{ id: "c1", type: "function", function: addClass }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAgentLoop({
      ...paramsBase(),
      maxRounds: 3,
      ambito: "grupo",
      modo: "build",
      rol: "EDITOR",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.pendingProposals).toHaveLength(1);
    expect(result.hitlRequired).toBe(true);
    expect(result.finalContent).toBe("Voy a editar.");
  });

  it("en HITL conserva propuestas distintas entre rondas", async () => {
    const connect = {
      name: "connect",
      arguments: JSON.stringify({ from: "pedido", to: "linea", kind: "association" }),
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: "Creo la clase.",
          toolCalls: [{ id: "c1", type: "function", function: addClass }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: "Conecto las clases.",
          toolCalls: [{ id: "c2", type: "function", function: connect }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: "Listo.", toolCalls: [] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAgentLoop({
      ...paramsBase(),
      ambito: "grupo",
      modo: "build",
      rol: "EDITOR",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.pendingProposals).toHaveLength(2);
    expect(result.pendingProposals?.map((p) => p.toolName)).toEqual(["addClass", "connect"]);
  });

  it("en HITL no confunde el mismo nombre con argumentos distintos", async () => {
    const connectA = {
      name: "connect",
      arguments: JSON.stringify({ from: "usuario", to: "persona", kind: "association" }),
    };
    const connectB = {
      name: "connect",
      arguments: JSON.stringify({ from: "persona", to: "usuario", kind: "association" }),
    };
    const respuesta = (id: string, herramienta: { name: string; arguments: string }) => ({
      ok: true,
      json: async () => ({
        content: "Conecto.",
        toolCalls: [{ id, type: "function", function: herramienta }],
      }),
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(respuesta("c1", connectA))
      .mockResolvedValueOnce(respuesta("c2", connectB))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: "Listo.", toolCalls: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAgentLoop({
      ...paramsBase(),
      ambito: "grupo",
      modo: "build",
      rol: "EDITOR",
    });

    expect(result.pendingProposals).toHaveLength(2);
    expect(result.pendingProposals?.map((p) => p.args)).toEqual([
      { from: "usuario", to: "persona", kind: "association" },
      { from: "persona", to: "usuario", kind: "association" },
    ]);
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
