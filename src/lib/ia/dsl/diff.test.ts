import { describe, expect, it } from "vitest";
import type { DiagramaCanonico } from "./canonical";
import { diffDiagrama } from "./diff";
import { proyectarDiagrama } from "./project";
import { validarSalida } from "./validate";

const ESTADO = {
  classes: [
    {
      key: "pedido",
      name: "Pedido",
      category: "Class" as const,
      attributes: ["- total: double [1]", "+ estado: Estado"],
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
      label: "realiza",
    },
  ],
};

function actual(): DiagramaCanonico {
  return proyectarDiagrama(ESTADO).diagrama;
}

describe("diffDiagrama", () => {
  it("detecta clase nueva, atributo nuevo y relación nueva", () => {
    const proyeccion = proyectarDiagrama(ESTADO);
    const deseado: DiagramaCanonico = {
      entidades: [
        ...actual().entidades,
        { id: "n3", tipo: "class", nombre: "Producto", atributos: [{ nombre: "sku", tipo: "string", multiplicidad: "1" }] },
      ],
      relaciones: [
        ...actual().relaciones,
        { id: "e2", origen: "n1", destino: "n3", tipo: "composition", origenMult: "1", destinoMult: "0..*" },
      ],
    };

    const diff = diffDiagrama(proyeccion, deseado, { permitirBorrado: false });

    expect(diff.agregarEntidades.map((item) => item.key)).toEqual(["producto"]);
    expect(diff.agregarEntidades[0].atributosExtra).toHaveLength(1);
    expect(diff.agregarRelaciones).toHaveLength(1);
    expect(diff.agregarRelaciones[0]).toMatchObject({
      fromKey: "pedido",
      toKey: "producto",
      relacion: { tipo: "composition" },
    });
    expect(diff.eliminarEntidades).toEqual([]);
  });

  it("conserva multiplicidad y visibilidad actuales si el modelo las omite al actualizar", () => {
    const proyeccion = proyectarDiagrama(ESTADO);
    const base = actual();
    const deseado: DiagramaCanonico = {
      entidades: [
        {
          ...base.entidades[0],
          atributos: [{ nombre: "total", tipo: "decimal" }, ...(base.entidades[0].atributos ?? []).slice(1)],
        },
        base.entidades[1],
      ],
      relaciones: base.relaciones,
    };

    const diff = diffDiagrama(proyeccion, deseado, { permitirBorrado: false });

    expect(diff.actualizarAtributos).toHaveLength(1);
    expect(diff.actualizarAtributos[0].campo).toMatchObject({
      nombre: "total",
      tipo: "decimal",
      visibilidad: "private",
      multiplicidad: "1",
    });
  });

  it("actualiza el nombre de la clase y la relación existente", () => {
    const proyeccion = proyectarDiagrama(ESTADO);
    const base = actual();
    const deseado: DiagramaCanonico = {
      entidades: [
        { ...base.entidades[0], nombre: "PedidoVenta" },
        base.entidades[1],
      ],
      relaciones: [
        { ...base.relaciones[0], tipo: "aggregation", destinoMult: "1..*", etiqueta: "compra" },
      ],
    };

    const diff = diffDiagrama(proyeccion, deseado, { permitirBorrado: false });

    expect(diff.actualizarEntidades).toHaveLength(1);
    expect(diff.actualizarEntidades[0].deseado.nombre).toBe("PedidoVenta");
    expect(diff.actualizarRelaciones).toHaveLength(1);
    expect(diff.actualizarRelaciones[0].fusionada).toMatchObject({
      tipo: "aggregation",
      destinoMult: "1..*",
      etiqueta: "compra",
    });
  });

  it("no borra entidades, relaciones ni miembros si la instrucción no lo pide", () => {
    const proyeccion = proyectarDiagrama(ESTADO);
    const deseado: DiagramaCanonico = {
      entidades: [
        {
          id: "n1",
          tipo: "class",
          nombre: "Pedido",
          atributos: [{ nombre: "total", tipo: "double", visibilidad: "private", multiplicidad: "1" }],
          metodos: [],
        },
      ],
      relaciones: [],
    };

    const diff = diffDiagrama(proyeccion, deseado, { permitirBorrado: false });

    expect(diff.eliminarEntidades).toEqual([]);
    expect(diff.eliminarRelaciones).toEqual([]);
    expect(diff.eliminarAtributos).toEqual([]);
    expect(diff.eliminarMetodos).toEqual([]);
    expect(diff.advertencias.join(" ")).toContain("no se eliminó");
  });

  it("borra clases y deja que removeClass limpie sus relaciones", () => {
    const proyeccion = proyectarDiagrama(ESTADO);
    const deseado: DiagramaCanonico = {
      entidades: [
        {
          id: "n1",
          tipo: "class",
          nombre: "Pedido",
          atributos: [{ nombre: "total", tipo: "double", visibilidad: "private", multiplicidad: "1" }],
          metodos: [],
        },
      ],
      relaciones: [],
    };

    const diff = diffDiagrama(proyeccion, deseado, { permitirBorrado: true });

    expect(diff.eliminarEntidades.map((item) => item.realKey)).toEqual(["cliente"]);
    // removeClass elimina los enlaces conectados: no hace falta una llamada extra.
    expect(diff.eliminarRelaciones).toEqual([]);
    expect(diff.eliminarAtributos.map((item) => item.campo.nombre)).toEqual(["estado"]);
    expect(diff.eliminarMetodos.map((item) => item.metodo.nombre)).toEqual(["calcularTotal"]);
  });

  it("conserva miembros si el modelo omitió sus claves aunque se permita borrar", () => {
    const proyeccion = proyectarDiagrama(ESTADO);
    const deseado: DiagramaCanonico = {
      entidades: [
        {
          id: "n1",
          tipo: "class",
          nombre: "Pedido",
          atributosOmitidos: true,
          metodosOmitidos: true,
        },
        proyeccion.diagrama.entidades[1],
      ],
      relaciones: proyeccion.diagrama.relaciones,
    };

    const diff = diffDiagrama(proyeccion, deseado, { permitirBorrado: true });

    expect(diff.eliminarAtributos).toEqual([]);
    expect(diff.eliminarMetodos).toEqual([]);
    expect(diff.actualizarAtributos).toEqual([]);
    expect(diff.actualizarMetodos).toEqual([]);
  });

  it("borra una relación suelta cuando ambas entidades siguen existiendo", () => {
    const proyeccion = proyectarDiagrama(ESTADO);
    const deseado: DiagramaCanonico = {
      entidades: [...actual().entidades],
      relaciones: [],
    };

    const diff = diffDiagrama(proyeccion, deseado, { permitirBorrado: true });

    expect(diff.eliminarEntidades).toEqual([]);
    expect(diff.eliminarRelaciones.map((item) => item.linkKey)).toEqual(["l1"]);
  });

  it("empareja por nombre cuando el modelo omite los ids", () => {
    const proyeccion = proyectarDiagrama(ESTADO);
    const validada = validarSalida({
      entidades: [
        { tipo: "class", nombre: "Cliente", atributos: [], metodos: [] },
        { tipo: "class", nombre: "Pedido", atributos: [], metodos: [] },
      ],
      relaciones: [
        {
          origen: "Pedido",
          destino: "Cliente",
          tipo: "association",
          origenMult: "1",
          destinoMult: "0..*",
          etiqueta: "realiza",
        },
      ],
    });
    expect(validada.ok).toBe(true);
    if (!validada.ok) return;

    const diff = diffDiagrama(
      proyeccion,
      {
        entidades: validada.value.entidades ?? [],
        relaciones: validada.value.relaciones ?? [],
      },
      { permitirBorrado: false },
    );

    expect(diff.agregarEntidades).toEqual([]);
    expect(diff.eliminarEntidades).toEqual([]);
    expect(diff.actualizarEntidades).toEqual([]);
    expect(diff.agregarRelaciones).toEqual([]);
  });

  it("no cambia el tipo de relación si el modelo lo omite", () => {
    const estado = {
      classes: [
        { key: "hija", name: "Hija", category: "Class" as const },
        { key: "base", name: "Base", category: "Class" as const },
      ],
      links: [{ key: "l1", from: "hija", to: "base", kind: "generalization" as const }],
    };
    const proyeccion = proyectarDiagrama(estado);
    const deseado: DiagramaCanonico = {
      entidades: proyeccion.diagrama.entidades,
      relaciones: [
        {
          id: "e1",
          origen: "n1",
          destino: "n2",
          tipo: "association",
          tipoExplicito: false,
        },
      ],
    };

    const diff = diffDiagrama(proyeccion, deseado, { permitirBorrado: false });

    expect(diff.actualizarRelaciones).toEqual([]);
    expect(diff.agregarRelaciones).toEqual([]);
  });

  it("ignora cambios de categoría con una advertencia", () => {
    const proyeccion = proyectarDiagrama(ESTADO);
    const base = actual();
    const deseado: DiagramaCanonico = {
      entidades: [{ ...base.entidades[0], tipo: "interface" }, base.entidades[1]],
      relaciones: base.relaciones,
    };

    const diff = diffDiagrama(proyeccion, deseado, { permitirBorrado: false });

    expect(diff.actualizarEntidades).toEqual([]);
    expect(diff.advertencias.join(" ")).toContain("Cambio de categoría ignorado");
  });

  it("aplica class → abstract con updateClass", () => {
    const proyeccion = proyectarDiagrama(ESTADO);
    const base = actual();
    const deseado: DiagramaCanonico = {
      entidades: [{ ...base.entidades[0], tipo: "abstract" }, base.entidades[1]],
      relaciones: base.relaciones,
    };

    const diff = diffDiagrama(proyeccion, deseado, { permitirBorrado: false });

    expect(diff.actualizarEntidades).toHaveLength(1);
    expect(diff.actualizarEntidades[0].cambiaAbstracto).toBe(true);
  });
});
