import { describe, expect, it } from "vitest";
import type { IAChatMessage } from "@/lib/ia/types";
import {
  construirMensajesDsl,
  extraerSnapshot,
  pedirBorrado,
} from "./prompt";

const ESTADO = {
  classes: [{ key: "pedido", name: "Pedido", category: "Class", attributes: ["- total: double"] }],
  links: [],
};

describe("extraerSnapshot", () => {
  it("extrae el snapshot de la Capa 2 del builder", () => {
    const prompt = `Prompt base\n\n## Capa 2 · Estado actual del diagrama\nEsta es la única fuente.\n${JSON.stringify(ESTADO)}\n\n## Capa 3 · Colaboradores\n- Ana`;
    expect(extraerSnapshot(prompt)).toEqual(ESTADO);
  });

  it("extrae el snapshot del prompt legacy", () => {
    const prompt = `Prompt base\n\nEstado actual del diagrama (JSON compacto; usa estas claves exactas al referirte a clases o relaciones):\n${JSON.stringify(ESTADO)}`;
    expect(extraerSnapshot(prompt)).toEqual(ESTADO);
  });

  it("reconoce el diagrama vacío", () => {
    const prompt = "## Capa 2 · Estado actual del diagrama\nEl diagrama está vacío.";
    expect(extraerSnapshot(prompt)).toEqual({ classes: [], links: [] });
  });

  it("no usa el DSL si el snapshot perdió miembros por presupuesto", () => {
    const prompt = `## Capa 2 · Estado actual del diagrama\n${JSON.stringify(ESTADO)}\n[miembros omitidos por presupuesto]`;
    expect(extraerSnapshot(prompt)).toBeNull();
  });

  it("devuelve null si no hay snapshot", () => {
    expect(extraerSnapshot("Solo instrucciones.")).toBeNull();
  });
});

describe("construirMensajesDsl", () => {
  const diagrama = {
    entidades: [{ id: "n1", tipo: "class" as const, nombre: "Pedido" }],
    relaciones: [],
  };

  it("reemplaza la sección de estado y añade el contrato", () => {
    const mensajes: IAChatMessage[] = [
      {
        role: "system",
        content:
          "## Capa 1 · Rol\n- Editable.\n\n## Capa 2 · Estado actual del diagrama\nViejo\n{\"classes\":[],\"links\":[]}\n\n## Capa 3 · Colaboradores\n- Ana",
      },
      { role: "user", content: "Agrega Cliente" },
    ];

    const salida = construirMensajesDsl(mensajes, diagrama);

    expect(salida[0].role).toBe("system");
    expect(salida[0].content).toContain("## Capa 1 · Rol");
    expect(salida[0].content).toContain("## Capa 3 · Colaboradores");
    expect(salida[0].content).not.toContain("Viejo");
    expect(salida[0].content).toContain("## Cómo responder en este turno");
    expect(salida[0].content).toContain(JSON.stringify(diagrama));
    expect(salida[1]).toEqual({ role: "user", content: "Agrega Cliente" });
  });

  it("convierte los resultados de tools en mensajes de usuario", () => {
    const mensajes: IAChatMessage[] = [
      { role: "system", content: "Sistema" },
      { role: "user", content: "Edita" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "1",
            type: "function",
            function: { name: "updateClass", arguments: "{}" },
          },
        ],
      },
      { role: "tool", name: "updateClass", content: '{"ok":true}' },
    ];

    const salida = construirMensajesDsl(mensajes, diagrama);

    expect(salida[2].content).toContain("Solicité las herramientas: updateClass");
    expect(salida[3]).toEqual({
      role: "user",
      content: "Resultado de la herramienta de updateClass:\n{\"ok\":true}",
    });
  });
});

describe("pedirBorrado", () => {
  it("autoriza borrar solo cuando la instrucción lo pide", () => {
    expect(pedirBorrado([{ role: "user", content: "Elimina Cliente" }])).toBe(true);
    expect(pedirBorrado([{ role: "user", content: "Reemplaza Pedido por Venta" }])).toBe(true);
    expect(pedirBorrado([{ role: "user", content: "Agrega un atributo a Pedido" }])).toBe(false);
    expect(pedirBorrado([{ role: "user", content: "No elimines nada, solo agrega Producto" }])).toBe(false);
    expect(pedirBorrado([{ role: "user", content: "Sin borrar relaciones, agrega Cliente" }])).toBe(false);
  });

  it("mira solo el último mensaje de la persona", () => {
    expect(
      pedirBorrado([
        { role: "user", content: "Elimina Cliente" },
        { role: "assistant", content: "Listo" },
        { role: "user", content: "Ahora agrega Producto" },
      ]),
    ).toBe(false);
  });
});
