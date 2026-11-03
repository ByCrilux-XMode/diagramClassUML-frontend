import { describe, expect, it } from "vitest";
import type { IAChatMessage } from "../types";
import type { ProviderProfile } from "../providers";
import {
  agruparEnBloques,
  calcularPresupuesto,
  estimateTokens,
  recortarMensajes,
  sanearIntegridad,
} from "./budget";

const perfil: ProviderProfile = { id: "hf-space", contextWindow: 500, maxOutput: 50 };

const tools = [
  {
    type: "function" as const,
    function: { name: "addClass", description: "x".repeat(40), parameters: { type: "object" as const, properties: {} } },
  },
];

function turno(n: number, relleno = 400): IAChatMessage[] {
  return [
    { role: "user", content: `pregunta ${n} ${"a".repeat(relleno)}` },
    { role: "assistant", content: `respuesta ${n} ${"b".repeat(relleno)}` },
  ];
}

describe("estimateTokens", () => {
  it("estima caracteres / 3.5 hacia arriba", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a".repeat(7))).toBe(2);
    expect(estimateTokens("a".repeat(8))).toBe(3);
  });
});

describe("calcularPresupuesto", () => {
  it("descuenta salida, herramientas y margen", () => {
    const p = calcularPresupuesto(perfil, tools, "sistema");
    expect(p.entrada).toBe(Math.floor((500 - 50) * 0.9));
    expect(p.herramientas).toBeGreaterThan(0);
    expect(p.disponible).toBeLessThan(p.entrada);
  });
});

describe("agruparEnBloques", () => {
  it("corta en cada mensaje de usuario", () => {
    const bloques = agruparEnBloques([...turno(1), ...turno(2)]);
    expect(bloques).toHaveLength(2);
    expect(bloques[0][0].content).toContain("pregunta 1");
  });
});

describe("recortarMensajes", () => {
  it("nunca elimina el system ni el mensaje actual", () => {
    const messages: IAChatMessage[] = [
      { role: "system", content: "prompt del sistema" },
      ...turno(1),
      ...turno(2),
      ...turno(3),
      { role: "user", content: "mensaje actual" },
    ];
    const r = recortarMensajes({ messages, tools, systemPrompt: "prompt del sistema", perfil });
    expect(r.messages[0].role).toBe("system");
    expect(r.messages[r.messages.length - 1].content).toBe("mensaje actual");
    expect(r.eliminados).toBeGreaterThan(0);
    expect(r.tokensEstimados).toBeLessThanOrEqual(r.presupuesto.entrada);
  });

  it("conserva los turnos más recientes", () => {
    const messages: IAChatMessage[] = [
      { role: "system", content: "s" },
      ...turno(1),
      ...turno(2),
      ...turno(3),
      { role: "user", content: "actual" },
    ];
    const r = recortarMensajes({ messages, tools, systemPrompt: "s", perfil });
    const textos = r.messages.map((m) => m.content).join(" ");
    expect(textos).toContain("pregunta 3");
    expect(textos).not.toContain("pregunta 1");
  });

  it("no deja un assistant con tool_calls sin sus respuestas", () => {
    const messages: IAChatMessage[] = [
      { role: "system", content: "s" },
      {
        role: "user",
        content: "pregunta 1",
      },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "c1", type: "function", function: { name: "addClass", arguments: "{}" } }],
      },
      { role: "tool", tool_call_id: "c1", name: "addClass", content: "ok" },
      { role: "assistant", content: "respuesta 1" },
      { role: "user", content: "actual" },
    ];
    const r = recortarMensajes({ messages, tools, systemPrompt: "s", perfil });
    const idxAssistant = r.messages.findIndex((m) => m.role === "assistant" && m.tool_calls);
    if (idxAssistant >= 0) {
      const siguiente = r.messages[idxAssistant + 1];
      expect(siguiente?.role).toBe("tool");
    }
  });

  it("trunca resultados de herramienta desproporcionados", () => {
    const messages: IAChatMessage[] = [
      { role: "system", content: "s" },
      { role: "user", content: "consulta" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "c1", type: "function", function: { name: "getState", arguments: "{}" } }],
      },
      { role: "tool", tool_call_id: "c1", name: "getState", content: "x".repeat(20000) },
    ];
    const r = recortarMensajes({ messages, tools, systemPrompt: "s", perfil });
    expect(r.truncados).toBeGreaterThan(0);
    expect(r.messages.some((m) => m.content.includes("salida recortada"))).toBe(true);
  });
});

describe("sanearIntegridad", () => {
  it("elimina un tool sin assistant que lo invoque", () => {
    const limpio = sanearIntegridad([
      { role: "user", content: "u" },
      { role: "tool", tool_call_id: "huerfano", content: "x" },
    ]);
    expect(limpio).toHaveLength(1);
    expect(limpio[0].role).toBe("user");
  });
});
