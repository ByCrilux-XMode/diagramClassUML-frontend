import { describe, expect, it } from "vitest";
import { diffEstados } from "./diff";
import { claveRelacion, estadoVacio } from "./estado";
import type { ClaseSemantica, EstadoSemantico, RelacionSemantica } from "./estado";

function estado(
  clases: ClaseSemantica[],
  relaciones: RelacionSemantica[] = [],
): EstadoSemantico {
  const base = estadoVacio();
  for (const clase of clases) base.clases.set(clase.key, clase);
  for (const relacion of relaciones) base.relaciones.set(relacion.key, relacion);
  return base;
}

const pedido = (extra: Partial<ClaseSemantica> = {}): ClaseSemantica => ({
  key: "pedido",
  name: "Pedido",
  category: "Class",
  isAbstract: false,
  attributes: [],
  methods: [],
  ...extra,
});

const cliente = (): ClaseSemantica => ({
  key: "cliente",
  name: "Cliente",
  category: "Class",
  isAbstract: false,
  attributes: [],
  methods: [],
});

const relacion = (from: string, to: string): RelacionSemantica => ({
  key: claveRelacion(from, "association", to),
  from,
  to,
  category: "association",
});

describe("diffEstados", () => {
  it("mover o redimensionar no genera cambios", () => {
    // El estado semántico no incluye `loc` ni `size`: dos lecturas del mismo
    // diagrama tras arrastrar una caja producen un diff vacío.
    const antes = estado([pedido(), cliente()], [relacion("pedido", "cliente")]);
    const despues = estado([pedido(), cliente()], [relacion("pedido", "cliente")]);

    const resultado = diffEstados(antes, despues);

    expect(resultado.cambios).toHaveLength(0);
    expect(resultado.tipo).toBeNull();
  });

  it("renombrar una clase genera un solo cambio", () => {
    const antes = estado([pedido()]);
    const despues = estado([pedido({ name: "Orden" })]);

    const resultado = diffEstados(antes, despues);

    expect(resultado.cambios).toHaveLength(1);
    expect(resultado.cambios[0]).toMatchObject({
      accion: "actualizar",
      entidadTipo: "clase",
      entidadKey: "pedido",
      campo: "name",
      antes: "Pedido",
      despues: "Orden",
    });
    expect(resultado.tipo).toBe("clase.actualizar");
  });

  it("borrar una clase con dos relaciones genera tres cambios y una sola entidad raíz", () => {
    const antes = estado(
      [pedido(), cliente()],
      [relacion("pedido", "cliente"), relacion("cliente", "pedido")],
    );
    const despues = estado([cliente()]);

    const resultado = diffEstados(antes, despues);

    expect(resultado.cambios).toHaveLength(3);
    expect(resultado.cambios.filter((cambio) => cambio.entidadTipo === "clase")).toHaveLength(1);
    expect(resultado.cambios.filter((cambio) => cambio.entidadTipo === "relacion")).toHaveLength(2);
    expect(resultado.cambios.every((cambio) => cambio.accion === "eliminar")).toBe(true);
    expect(resultado.entidades).toContain("pedido");
    expect(resultado.tipo).toBe("clase.eliminar");
  });

  it("crear una clase es un cambio de creación y clasifica como clase.crear", () => {
    const resultado = diffEstados(estado([]), estado([pedido()]));

    expect(resultado.cambios).toHaveLength(1);
    expect(resultado.tipo).toBe("clase.crear");
  });

  it("crear una relación entre clases existentes clasifica como relación", () => {
    const resultado = diffEstados(
      estado([pedido(), cliente()]),
      estado([pedido(), cliente()], [relacion("pedido", "cliente")]),
    );

    expect(resultado.cambios).toHaveLength(1);
    expect(resultado.tipo).toBe("relacion.crear");
  });

  it("un cambio de clase y relación a la vez clasifica como mixto", () => {
    const resultado = diffEstados(
      estado([pedido()]),
      estado([pedido(), cliente()], [relacion("pedido", "cliente")]),
    );

    expect(resultado.tipo).toBe("mixto");
  });

  it("añadir un atributo se registra contra la clase que lo contiene", () => {
    const antes = estado([pedido()]);
    const despues = estado([
      pedido({ attributes: [{ name: "total", type: "number", visibility: "+" }] }),
    ]);

    const resultado = diffEstados(antes, despues);

    expect(resultado.cambios).toHaveLength(1);
    expect(resultado.cambios[0]).toMatchObject({
      accion: "crear",
      entidadTipo: "atributo",
      entidadKey: "pedido.total",
    });
    expect(resultado.entidades).toContain("pedido");
  });
});
