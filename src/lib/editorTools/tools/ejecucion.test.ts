import * as go from "gojs";
import { beforeEach, describe, expect, it } from "vitest";
import { registerDiagram, unregisterDiagram } from "../graphStore";
import { addClassTool } from "./addClass";
import { connectTool } from "./connect";
import { removeClassTool } from "./removeClass";
import { updateAttributeTool } from "./updateAttribute";
import { updateClassTool } from "./updateClass";
import { updateMethodTool } from "./updateMethod";
import { updateRelationTool } from "./updateRelation";

/**
 * Ejecución real de las tools sobre un `GraphLinksModel` de GoJS.
 *
 * Las tools no dependen de un lienzo: solo usan `diagram.model`, las
 * transacciones, `viewportBounds` y la selección. Este diagrama mínimo permite
 * comprobar que la lógica de escritura muta el modelo como espera el HITL.
 */
function crearDiagrama() {
  const model = new go.GraphLinksModel([], []);
  const transacciones: string[] = [];
  const diagram = {
    model,
    viewportBounds: new go.Rect(0, 0, 1200, 900),
    startTransaction: (nombre: string) => transacciones.push(nombre),
    commitTransaction: () => undefined,
    rollbackTransaction: () => undefined,
    findNodeForData: () => null,
    select: () => undefined,
  };
  registerDiagram(diagram as unknown as go.Diagram);
  return { diagram, model, transacciones };
}

function nodo(model: go.GraphLinksModel, key: string) {
  return model.nodeDataArray.find(
    (item) => (item as { key?: string }).key === key,
  ) as Record<string, unknown>;
}

beforeEach(() => {
  unregisterDiagram();
});

describe("addClass", () => {
  it("crea la clase con atributos normalizados y posición automática", () => {
    const { model, transacciones } = crearDiagrama();

    const validado = addClassTool.validate({
      key: "Pedido",
      name: "Pedido",
      attributes: [{ name: "total", type: "double" }],
    });
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;

    const resultado = addClassTool.execute(validado.value);

    expect(resultado.ok).toBe(true);
    expect(model.nodeDataArray).toHaveLength(1);
    const pedido = nodo(model, "pedido");
    expect(pedido).toMatchObject({
      key: "pedido",
      name: "Pedido",
      category: "Class",
      isAbstract: false,
      attributes: [{ name: "total", type: "double", visibility: "+" }],
    });
    expect(typeof pedido.loc).toBe("string");
    expect(transacciones).toEqual(["tool-addClass"]);
  });

  it("rechaza una clave duplicada sin tocar el modelo", () => {
    const { model } = crearDiagrama();
    addClassTool.execute({ key: "pedido", name: "Pedido" });

    const resultado = addClassTool.execute({ key: "PEDIDO", name: "Otro" });

    expect(resultado.ok).toBe(false);
    expect(model.nodeDataArray).toHaveLength(1);
  });

  it("crea interfaces y enumeraciones con su forma propia", () => {
    const { model } = crearDiagrama();
    addClassTool.execute({ key: "estado", name: "Estado", category: "Enum", literals: ["NUEVO", "PAGADO"] });
    addClassTool.execute({ key: "repo", name: "Repo", category: "Interface" });

    expect(nodo(model, "estado")).toMatchObject({
      category: "Enum",
      literals: ["NUEVO", "PAGADO"],
    });
    expect(nodo(model, "repo")).toMatchObject({
      category: "Interface",
      methods: [],
    });
  });
});

describe("updateClass", () => {
  it("renombra y marca abstracta", () => {
    const { model } = crearDiagrama();
    addClassTool.execute({ key: "pedido", name: "Pedido" });

    const resultado = updateClassTool.execute({ key: "pedido", name: "PedidoVenta", isAbstract: true });

    expect(resultado.ok).toBe(true);
    expect(nodo(model, "pedido")).toMatchObject({ name: "PedidoVenta", isAbstract: true });
  });

  it("rechaza literales sobre una clase normal", () => {
    const { model } = crearDiagrama();
    addClassTool.execute({ key: "pedido", name: "Pedido" });

    const resultado = updateClassTool.execute({ key: "pedido", literals: ["A"] });

    expect(resultado.ok).toBe(false);
    expect(nodo(model, "pedido").literals).toBeUndefined();
  });
});

describe("updateAttribute", () => {
  it("añade, actualiza y elimina atributos", () => {
    const { model } = crearDiagrama();
    addClassTool.execute({ key: "pedido", name: "Pedido" });

    updateAttributeTool.execute({
      classKey: "pedido",
      action: "add",
      attribute: { name: "total", type: "double", visibility: "-" },
    });
    expect(nodo(model, "pedido").attributes).toEqual([
      { name: "total", type: "double", visibility: "-" },
    ]);

    updateAttributeTool.execute({
      classKey: "pedido",
      action: "update",
      attribute: { name: "total", type: "BigDecimal", visibility: "-" },
    });
    expect(nodo(model, "pedido").attributes).toEqual([
      { name: "total", type: "BigDecimal", visibility: "-" },
    ]);

    updateAttributeTool.execute({
      classKey: "pedido",
      action: "remove",
      attribute: { name: "total" },
    });
    expect(nodo(model, "pedido").attributes).toEqual([]);
  });

  it("falla si la clase no existe", () => {
    crearDiagrama();

    const resultado = updateAttributeTool.execute({
      classKey: "fantasma",
      action: "add",
      attribute: { name: "x" },
    });

    expect(resultado.ok).toBe(false);
    expect(resultado).toHaveProperty("error");
  });
});

describe("updateMethod", () => {
  it("añade un método con parámetros y lo elimina", () => {
    const { model } = crearDiagrama();
    addClassTool.execute({ key: "pedido", name: "Pedido" });

    updateMethodTool.execute({
      classKey: "pedido",
      action: "add",
      method: {
        name: "pagar",
        visibility: "+",
        parameters: [{ name: "monto", type: "double", direction: "in" }],
        returnType: "boolean",
      },
    });
    expect(nodo(model, "pedido").methods).toEqual([
      {
        name: "pagar",
        visibility: "+",
        parameters: [{ direction: "in", name: "monto", type: "double" }],
        returnType: "boolean",
      },
    ]);

    updateMethodTool.execute({
      classKey: "pedido",
      action: "remove",
      method: { name: "pagar" },
    });
    expect(nodo(model, "pedido").methods).toEqual([]);
  });
});

describe("connect y updateRelation", () => {
  function conDosClases() {
    const contexto = crearDiagrama();
    addClassTool.execute({ key: "pedido", name: "Pedido" });
    addClassTool.execute({ key: "cliente", name: "Cliente" });
    return contexto;
  }

  it("crea una relación y devuelve su clave", () => {
    const { model } = conDosClases();

    const resultado = connectTool.execute({
      from: "pedido",
      to: "cliente",
      kind: "association",
      fromMult: "1",
      toMult: "0..*",
      label: "compra",
    });

    expect(resultado.ok).toBe(true);
    expect(model.linkDataArray).toHaveLength(1);
    expect(model.linkDataArray[0]).toMatchObject({
      from: "pedido",
      to: "cliente",
      category: "association",
      fromMultiplicity: "1",
      toMultiplicity: "0..*",
      name: "compra",
    });
  });

  it("actualiza multiplicidades y elimina la relación", () => {
    const { model } = conDosClases();
    connectTool.execute({ from: "pedido", to: "cliente", kind: "association" });

    updateRelationTool.execute({
      action: "update",
      from: "pedido",
      to: "cliente",
      toMult: "1..*",
      label: "pide",
    });
    expect(model.linkDataArray[0]).toMatchObject({
      toMultiplicity: "1..*",
      name: "pide",
    });

    updateRelationTool.execute({ action: "remove", from: "pedido", to: "cliente" });
    expect(model.linkDataArray).toEqual([]);
  });

  it("no conecta extremos inexistentes", () => {
    const { model } = conDosClases();

    const resultado = connectTool.execute({ from: "pedido", to: "fantasma", kind: "association" });

    expect(resultado.ok).toBe(false);
    expect(model.linkDataArray).toEqual([]);
  });
});

describe("removeClass", () => {
  it("elimina la clase del modelo", () => {
    const { model } = crearDiagrama();
    addClassTool.execute({ key: "pedido", name: "Pedido" });

    const resultado = removeClassTool.execute({ key: "pedido" });

    expect(resultado.ok).toBe(true);
    expect(model.nodeDataArray).toEqual([]);
  });
});

describe("llamada real devuelta por el modelo", () => {
  it("acepta los argumentos que produjo OpenRouter para «crea la clase Pedido»", () => {
    const { model } = crearDiagrama();
    // Salida literal de google/gemma-4-31b-it:free en la prueba en vivo.
    const args = {
      key: "pedido_01",
      category: "Class",
      attributes: [{ name: "total", visibility: "private", type: "double" }],
      name: "Pedido",
    };

    const validado = addClassTool.validate(args);
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;

    const resultado = addClassTool.execute(validado.value);

    expect(resultado.ok).toBe(true);
    expect(nodo(model, "pedido_01")).toMatchObject({
      name: "Pedido",
      category: "Class",
      // El modelo escribió "private" (texto libre); la tool lo normaliza a "+".
      attributes: [{ name: "total", visibility: "+", type: "double" }],
    });
  });
});
