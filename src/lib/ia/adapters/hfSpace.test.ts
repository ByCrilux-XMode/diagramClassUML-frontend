import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HF_SPACE_CHRISTS20_URL,
  HF_SPACE_MODEL_LORA,
  HF_SPACE_MODEL_PROPIO,
  HF_SPACE_PROPIO_URL,
  resolverSpaceHf,
} from "@/lib/ia/config";
import {
  analizarRonda,
  chat,
  debeUsarDsl,
  listModels,
  mensajesConHerramientas,
  parseTextoToToolCalls,
} from "./hfSpace";
import type { IAChatMessage, IAChatRequestBody, IAToolDef } from "@/lib/ia/types";

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

describe("registro de modelos hf-space", () => {
  it("lista primero el modelo propio con el nombre del selector", async () => {
    expect(HF_SPACE_MODEL_PROPIO).toBe("piloto-qwen2.5coder");
    await expect(listModels()).resolves.toEqual([
      "piloto-qwen2.5coder",
      "CHRISTS20/qwn-uml-lora-7b-v2",
      "Qwen/Qwen2.5-Coder-7B-Instruct",
    ]);
  });

  it("resuelve el modelo propio al Space propio", () => {
    expect(resolverSpaceHf(HF_SPACE_MODEL_PROPIO).url).toBe(HF_SPACE_PROPIO_URL);
    expect(resolverSpaceHf("PILOTO-QWEN2.5CODER").url).toBe(HF_SPACE_PROPIO_URL);
  });

  it("conserva el Space heredado para el modelo LoRA", () => {
    expect(resolverSpaceHf(HF_SPACE_MODEL_LORA).url).toBe(HF_SPACE_CHRISTS20_URL);
  });

  it("sin modelo o con un ID desconocido usa el Space propio", () => {
    expect(resolverSpaceHf(null).url).toBe(HF_SPACE_PROPIO_URL);
    expect(resolverSpaceHf("otro/modelo").url).toBe(HF_SPACE_PROPIO_URL);
  });
});

const toolsEscritura: IAToolDef[] = [
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

const toolsLectura: IAToolDef[] = [
  {
    type: "function",
    function: {
      name: "consultarHistorial",
      description: "Consulta la bitácora",
      parameters: { type: "object", properties: {} },
    },
  },
];

function solicitud(parcial: Partial<IAChatRequestBody> = {}): IAChatRequestBody {
  return {
    provider: "hf-space",
    model: HF_SPACE_MODEL_PROPIO,
    messages: [],
    tools: toolsEscritura,
    ...parcial,
  };
}

const SYSTEM_CON_ESTADO = `Eres el asistente UML.

## Capa 2 · Estado actual del diagrama
Esta es la única fuente de verdad.
{"classes":[{"key":"pedido","name":"Pedido","category":"Class"}],"links":[]}`;

function respuestaChat(texto: string): Response {
  return new Response(JSON.stringify({ texto }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("debeUsarDsl", () => {
  it("activa el DSL para el Space propio con tools de escritura", () => {
    expect(debeUsarDsl(solicitud())).toBe(true);
    expect(debeUsarDsl(solicitud({ model: "Qwen/Qwen2.5-Coder-7B-Instruct" }))).toBe(true);
  });

  it("lo desactiva para el Space LoRA y para modelos desconocidos", () => {
    expect(debeUsarDsl(solicitud({ model: HF_SPACE_MODEL_LORA }))).toBe(false);
    expect(debeUsarDsl(solicitud({ model: "otro/modelo" }))).toBe(false);
  });

  it("lo desactiva cuando el turno solo ofrece tools de lectura", () => {
    expect(debeUsarDsl(solicitud({ tools: toolsLectura }))).toBe(false);
  });
});

describe("analizarRonda", () => {
  it("detecta resultados de escritura después del último mensaje de la persona", () => {
    const mensajes: IAChatMessage[] = [
      { role: "user", content: "Crea Cliente" },
      { role: "assistant", content: "" },
      { role: "tool", name: "addClass", content: '{"ok":true,"proposed":true}' },
    ];
    expect(analizarRonda(mensajes)).toEqual({ esSegundaRonda: true, huboEscritura: true });
  });

  it("no cierra la ronda cuando el resultado es de solo lectura", () => {
    const mensajes: IAChatMessage[] = [
      { role: "user", content: "¿Qué pasó con Pedido?" },
      { role: "assistant", content: "" },
      { role: "tool", name: "consultarHistorial", content: '{"ok":true}' },
    ];
    expect(analizarRonda(mensajes)).toEqual({ esSegundaRonda: true, huboEscritura: false });
  });

  it("no considera segunda ronda si no hay resultados de tools", () => {
    const mensajes: IAChatMessage[] = [{ role: "user", content: "Hola" }];
    expect(analizarRonda(mensajes)).toEqual({ esSegundaRonda: false, huboEscritura: false });
  });
});

describe("chat con DSL", () => {
  it("envía el diagrama canónico sin tools y traduce el diff a tool calls", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(payload.tools).toBeUndefined();
      expect(payload.max_tokens).toBe(1536);
      const mensajes = payload.mensajes as Array<{ role: string; content: string }>;
      expect(mensajes[0].role).toBe("system");
      expect(mensajes[0].content).toContain("## Cómo responder en este turno");
      expect(mensajes[0].content).toContain('"id":"n1"');
      return respuestaChat(
        JSON.stringify({
          tipo: "diagrama",
          mensaje: "Agregué Cliente.",
          entidades: [
            { id: "n1", tipo: "class", nombre: "Pedido" },
            { id: "n2", tipo: "class", nombre: "Cliente" },
          ],
          relaciones: [],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await chat(
      solicitud({
        messages: [
          { role: "system", content: SYSTEM_CON_ESTADO },
          { role: "user", content: "Agrega Cliente" },
        ],
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resultado.toolCalls.map((call) => call.function.name)).toEqual(["addClass"]);
    expect(JSON.parse(resultado.toolCalls[0].function.arguments)).toMatchObject({
      key: "cliente",
      name: "Cliente",
    });
    expect(resultado.content).toContain("Agregué Cliente.");
  });

  it("traduce una salida de consulta a tools de lectura", async () => {
    const fetchMock = vi.fn(async () =>
      respuestaChat(
        JSON.stringify({
          tipo: "consulta",
          mensaje: "Voy a revisar el historial.",
          consultas: [{ herramienta: "consultarHistorial", args: { entidad: "Pedido" } }],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await chat(
      solicitud({
        messages: [
          { role: "system", content: SYSTEM_CON_ESTADO },
          { role: "user", content: "¿Qué cambió en Pedido?" },
        ],
      }),
    );

    expect(resultado.toolCalls.map((call) => call.function.name)).toEqual(["consultarHistorial"]);
    expect(JSON.parse(resultado.toolCalls[0].function.arguments)).toEqual({ entidad: "Pedido" });
  });

  it("reintenta una vez si la primera respuesta no cumple el contrato", async () => {
    let llamadas = 0;
    const fetchMock = vi.fn(async () => {
      llamadas += 1;
      if (llamadas === 1) return respuestaChat("no soy JSON");
      return respuestaChat(
        JSON.stringify({
          tipo: "diagrama",
          mensaje: "Agregué Cliente.",
          entidades: [
            { id: "n1", tipo: "class", nombre: "Pedido" },
            { id: "n2", tipo: "class", nombre: "Cliente" },
          ],
          relaciones: [],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await chat(
      solicitud({
        messages: [
          { role: "system", content: SYSTEM_CON_ESTADO },
          { role: "user", content: "Agrega Cliente" },
        ],
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(resultado.toolCalls).toHaveLength(1);
  });

  it("no vuelve a proponer si ya hay resultados de escritura", async () => {
    const fetchMock = vi.fn(async () => respuestaChat("no debería llamarse"));
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await chat(
      solicitud({
        messages: [
          { role: "system", content: SYSTEM_CON_ESTADO },
          { role: "user", content: "Agrega Cliente" },
          { role: "assistant", content: "Propuesta lista." },
          { role: "tool", name: "addClass", content: '{"ok":true,"proposed":true}' },
        ],
      }),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(resultado.toolCalls).toEqual([]);
    expect(resultado.content).toBe("Propuesta lista.");
  });

  it("mantiene el camino legacy para el Space LoRA", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
      expect(payload.max_tokens).toBe(512);
      expect(payload.tools).toBeDefined();
      return respuestaChat(
        '<tool_calls>{"name":"addClass","arguments":{"key":"cliente","name":"Cliente"}}</tool_calls>',
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await chat(
      solicitud({
        model: HF_SPACE_MODEL_LORA,
        messages: [{ role: "user", content: "Agrega Cliente" }],
      }),
    );

    expect(resultado.toolCalls.map((call) => call.function.name)).toEqual(["addClass"]);
  });
});
