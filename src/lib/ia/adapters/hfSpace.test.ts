import { describe, expect, it } from "vitest";
import { mensajesConHerramientas, parseTextoToToolCalls } from "./hfSpace";
import type { IAToolDef } from "@/lib/ia/types";

const herramientas: IAToolDef[] = [
  {
    type: "function",
    function: {
      name: "addClass",
      description: "Crea una clase",
      parameters: {
        type: "object",
        properties: { key: { type: "string" }, name: { type: "string" } },
        required: ["key", "name"],
      },
    },
  },
];

describe("parseTextoToToolCalls", () => {
  it("recupera todas las llamadas del formato <tool_calls> del LoRA", () => {
    const texto = `<tool_calls>
{"name": "addClass", "arguments": "{\\"key\\": \\"clase_1\\", \\"name\\": \\"Pedido\\"}"}
{"name": "addAttribute", "arguments": "{\\"classKey\\": \\"clase_1\\", \\"attribute\\": {\\"name\\": \\"total\\", \\"type\\": \\"double\\"}}"}
</tool_calls>`;

    const llamadas = parseTextoToToolCalls(texto);

    expect(llamadas.map((llamada) => llamada.function.name)).toEqual([
      "addClass",
      "addAttribute",
    ]);
    expect(JSON.parse(llamadas[0].function.arguments)).toEqual({
      key: "clase_1",
      name: "Pedido",
    });
  });

  it("recupera un bloque ```json con un arreglo de tool_calls", () => {
    const texto = `Claro:\n\`\`\`json
{"tool_calls":[{"name":"addClass","arguments":{"key":"pedido","name":"Pedido"}},{"name":"addAttribute","arguments":{"classKey":"pedido","attribute":{"name":"total","type":"double"}}}]}
\`\`\``;

    const llamadas = parseTextoToToolCalls(texto);

    expect(llamadas).toHaveLength(2);
    expect(llamadas[1].function.name).toBe("addAttribute");
  });

  it("no inventa llamadas cuando la respuesta es prosa", () => {
    expect(
      parseTextoToToolCalls("Una composición es una relación parte-todo."),
    ).toEqual([]);
  });

  it("deduplica objetos repetidos", () => {
    const texto = `{"name":"addClass","arguments":{"key":"a","name":"A"}}
{"name":"addClass","arguments":{"key":"a","name":"A"}}`;

    expect(parseTextoToToolCalls(texto)).toHaveLength(1);
  });
});

describe("mensajesConHerramientas", () => {
  it("añade el catálogo y el formato al system prompt existente", () => {
    const mensajes = mensajesConHerramientas(
      [
        { role: "system", content: "Eres un asistente UML." },
        { role: "user", content: "Crea Pedido" },
      ],
      herramientas,
    );

    expect(mensajes[0].role).toBe("system");
    expect(mensajes[0].content).toContain("Eres un asistente UML.");
    expect(mensajes[0].content).toContain("addClass");
    expect(mensajes[0].content).toContain("tool_calls");
    expect(mensajes[1].content).toBe("Crea Pedido");
  });

  it("no toca los mensajes si el turno no ofrece herramientas", () => {
    const mensajes = [{ role: "user", content: "¿Qué es UML?" }];
    expect(mensajesConHerramientas(mensajes, [])).toEqual(mensajes);
  });
});
