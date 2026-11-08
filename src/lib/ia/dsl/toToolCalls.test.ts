import { describe, expect, it } from "vitest";
import type { DiagramaCanonico } from "./canonical";
import { diffDiagrama } from "./diff";
import { proyectarDiagrama } from "./project";
import { toToolCalls } from "./toToolCalls";

const ESTADO = {
  classes: [
    {
      key: "pedido",
      name: "Pedido",
      category: "Class" as const,
      attributes: ["- total: double [1]"],
      methods: ["+ calcularTotal(): double"],
    },
    { key: "cliente", name: "Cliente", category: "Class" as const },
  ],
  links: [
    {
      key: "l1",
      from: "pedido",
      to: "cliente",
      kind: "association" as const,
      fromMult: "1",
      toMult: "0..*",
    },
  ],
};

function args(call: { function: { arguments: string } }): Record<string, unknown> {
  return JSON.parse(call.function.arguments) as Record<string, unknown>;
}

describe("toToolCalls", () => {
  it("genera addClass, el update de atributos extra y connect en orden", () => {
    const proyeccion = proyectarDiagrama(ESTADO);
    const base = proyeccion.diagrama;
    const deseado: DiagramaCanonico = {
      entidades: [
        ...base.entidades,
        {
          id: "n3",
          tipo: "class",
          nombre: "Producto",
          atributos: [
            { nombre: "sku", tipo: "string" },
            { nombre: "precio", tipo: "double", multiplicidad: "1", readonly: true },
          ],
        },
      ],
      relaciones: [
        ...base.relaciones,
        { id: "e2", origen: "n1", destino: "n3", tipo: "composition", origenMult: "1", destinoMult: "0..*" },
      ],
    };

    const calls = toToolCalls(diffDiagrama(proyeccion, deseado, { permitirBorrado: false }));

    expect(calls.map((call) => call.function.name)).toEqual([
      "addClass",
      "updateAttribute",
      "connect",
    ]);
    expect(args(calls[0])).toMatchObject({
      key: "producto",
      name: "Producto",
      category: "Class",
      attributes: [
        { name: "sku", type: "string", visibility: "+" },
        { name: "precio", type: "double", visibility: "+" },
      ],
    });
    expect(args(calls[1])).toEqual({
      classKey: "producto",
      action: "update",
      attribute: {
        name: "precio",
        type: "double",
        visibility: "+",
        multiplicity: "1",
        isReadOnly: true,
      },
    });
    expect(args(calls[2])).toMatchObject({
      from: "pedido",
      to: "producto",
      kind: "composition",
      fromMult: "1",
      toMult: "0..*",
    });
  });

  it("emite updateClass, updateAttribute y updateMethod con los nombres de tools reales", () => {
    const proyeccion = proyectarDiagrama(ESTADO);
    const base = proyeccion.diagrama;
    const deseado: DiagramaCanonico = {
      entidades: [
        {
          ...base.entidades[0],
          nombre: "PedidoVenta",
          atributos: [{ nombre: "total", tipo: "decimal", visibilidad: "private", multiplicidad: "1" }],
          metodos: [{ nombre: "calcularTotal", visibilidad: "public", retorno: "decimal" }],
        },
        base.entidades[1],
      ],
      relaciones: base.relaciones,
    };

    const calls = toToolCalls(diffDiagrama(proyeccion, deseado, { permitirBorrado: false }));

    expect(calls.map((call) => call.function.name)).toEqual([
      "updateClass",
      "updateAttribute",
      "updateMethod",
    ]);
    expect(args(calls[0])).toEqual({ key: "pedido", name: "PedidoVenta" });
    expect(args(calls[1])).toMatchObject({
      classKey: "pedido",
      action: "update",
      attribute: { name: "total", type: "decimal", visibility: "-", multiplicity: "1" },
    });
    expect(args(calls[2])).toMatchObject({
      classKey: "pedido",
      action: "update",
      method: { name: "calcularTotal", visibility: "+", returnType: "decimal" },
    });
  });

  it("elimina relaciones antes que clases", () => {
    const estado = {
      classes: [
        { key: "a", name: "A", category: "Class" as const },
        { key: "b", name: "B", category: "Class" as const },
        { key: "c", name: "C", category: "Class" as const },
      ],
      links: [
        { key: "ab", from: "a", to: "b", kind: "association" as const },
        { key: "bc", from: "b", to: "c", kind: "association" as const },
      ],
    };
    const proyeccion = proyectarDiagrama(estado);
    const deseado: DiagramaCanonico = {
      entidades: [proyeccion.diagrama.entidades[0], proyeccion.diagrama.entidades[1]],
      relaciones: [],
    };

    const calls = toToolCalls(diffDiagrama(proyeccion, deseado, { permitirBorrado: true }));

    expect(calls.map((call) => call.function.name)).toEqual([
      "updateRelation",
      "removeClass",
    ]);
    expect(args(calls[0])).toEqual({ linkKey: "ab", action: "remove" });
    expect(args(calls[1])).toEqual({ key: "c" });
  });
});
