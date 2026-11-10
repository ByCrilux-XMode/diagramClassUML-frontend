import { describe, expect, it } from "vitest";
import type { DiagramState } from "@/lib/editorTools";
import { proyectarDiagrama } from "./project";
import { validarSalida } from "./validate";

const estado: DiagramState = {
  classes: [
    {
      key: "pedido",
      name: "Pedido",
      category: "Class",
      attributes: ["- total: double [1]", "+ estado: Estado = PENDIENTE"],
      methods: ["+ calcularTotal(): double"],
    },
    { key: "cliente", name: "Cliente", category: "Class" },
  ],
  links: [
    {
      key: "l1",
      from: "pedido",
      to: "cliente",
      kind: "association",
      fromMult: "1",
      toMult: "0..*",
      label: "realiza",
    },
  ],
};

describe("proyectarDiagrama", () => {
  it("proyecta clases, miembros y relaciones con ids estables", () => {
    const proyeccion = proyectarDiagrama(estado);

    expect(proyeccion.diagrama.entidades.map((entidad) => entidad.id)).toEqual(["n1", "n2"]);
    expect(proyeccion.diagrama.entidades[0].atributos?.[0]).toMatchObject({
      visibilidad: "private",
      nombre: "total",
      tipo: "double",
      multiplicidad: "1",
    });
    expect(proyeccion.diagrama.entidades[0].metodos?.[0]).toMatchObject({
      visibilidad: "public",
      nombre: "calcularTotal",
      retorno: "double",
    });
    expect(proyeccion.diagrama.relaciones[0]).toMatchObject({
      id: "e1",
      origen: "n1",
      destino: "n2",
      tipo: "association",
      origenMult: "1",
      destinoMult: "0..*",
      etiqueta: "realiza",
    });
    expect(proyeccion.idMap.get("n1")).toBe("pedido");
    expect(proyeccion.relIdMap.get("e1")).toBe("l1");
  });
});

describe("validarSalida", () => {
  it("normaliza alias en español/inglés y miembros como string", () => {
    const resultado = validarSalida({
      tipo: "diagrama",
      mensaje: "ok",
      entidades: [
        {
          id: "n1",
          tipo: "Clase",
          nombre: "Pedido",
          atributos: ["- total: double [1]", { name: "estado", type: "Estado" }],
          metodos: ["+ calcularTotal(): double"],
        },
      ],
      relaciones: [],
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    const entidad = resultado.value.entidades?.[0];
    expect(entidad).toMatchObject({ id: "n1", tipo: "class", nombre: "Pedido" });
    expect(entidad?.atributos?.[0]).toMatchObject({ visibilidad: "private", nombre: "total" });
    expect(entidad?.atributos?.[1]).toMatchObject({ nombre: "estado", tipo: "Estado" });
    expect(entidad?.metodos?.[0]).toMatchObject({ nombre: "calcularTotal", retorno: "double" });
  });

  it("marca miembros omitidos para conservarlos en el diff", () => {
    const resultado = validarSalida({
      tipo: "diagrama",
      entidades: [{ id: "n1", tipo: "class", nombre: "Pedido" }],
      relaciones: [],
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.value.entidades?.[0]).toMatchObject({
      atributosOmitidos: true,
      metodosOmitidos: true,
    });
  });

  it("marca relaciones omitidas para que el adaptador conserve las actuales", () => {
    const resultado = validarSalida({
      tipo: "diagrama",
      entidades: [{ id: "n1", tipo: "class", nombre: "Pedido" }],
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.value.relacionesOmitidas).toBe(true);
  });

  it("marca el tipo como omitido cuando la relación no lo declara", () => {
    const resultado = validarSalida({
      entidades: [
        { id: "n1", tipo: "class", nombre: "A" },
        { id: "n2", tipo: "class", nombre: "B" },
      ],
      relaciones: [{ origen: "n1", destino: "n2" }],
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.value.relaciones?.[0]).toMatchObject({
      tipo: "association",
      tipoExplicito: false,
    });
  });

  it("resuelve extremos de relación por nombre de entidad", () => {
    const resultado = validarSalida({
      entidades: [
        { id: "n1", tipo: "class", nombre: "Pedido" },
        { id: "n2", tipo: "class", nombre: "Cliente" },
      ],
      relaciones: [{ origen: "Cliente", destino: "Pedido", tipo: "herencia" }],
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.value.relaciones?.[0]).toMatchObject({
      origen: "n2",
      destino: "n1",
      tipo: "inheritance",
    });
  });

  it("falla si una relación apunta a una entidad inexistente", () => {
    const resultado = validarSalida({
      entidades: [{ id: "n1", tipo: "class", nombre: "Pedido" }],
      relaciones: [{ origen: "n1", destino: "n9", tipo: "association" }],
    });

    expect(resultado.ok).toBe(false);
  });

  it("acepta consultas de solo lectura y descarta las desconocidas", () => {
    const resultado = validarSalida({
      tipo: "consulta",
      mensaje: "Necesito el historial",
      consultas: [
        { herramienta: "consultarHistorial", args: { entidad: "Pedido" } },
        { herramienta: "addClass", args: {} },
      ],
    });

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.value.consultas).toEqual([
      { herramienta: "consultarHistorial", args: { entidad: "Pedido" } },
    ]);
  });

  it("detecta el tipo chat cuando no hay diagrama", () => {
    const resultado = validarSalida({ mensaje: "Una asociación conecta dos clases." });
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.value).toMatchObject({ tipo: "chat" });
  });

  it("rechaza ids de entidad duplicados", () => {
    const resultado = validarSalida({
      entidades: [
        { id: "n1", tipo: "class", nombre: "A" },
        { id: "n1", tipo: "class", nombre: "B" },
      ],
      relaciones: [],
    });
    expect(resultado.ok).toBe(false);
  });
});
