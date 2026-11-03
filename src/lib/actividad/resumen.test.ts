import { describe, expect, it } from "vitest";
import type { CambioActividad, ResultadoDiff } from "./diff";
import type { ClaseSemantica, RelacionSemantica } from "./estado";
import { construirResumen } from "./resumen";

const clasePedido: ClaseSemantica = {
  key: "pedido",
  name: "Pedido",
  category: "Class",
  attributes: [],
  methods: [],
};

const claseCliente: ClaseSemantica = { ...clasePedido, key: "cliente", name: "Cliente" };

const relacion: RelacionSemantica = {
  key: "pedido|association|cliente",
  from: "pedido",
  to: "cliente",
  category: "association",
  fromMultiplicity: "1",
  toMultiplicity: "0..*",
};

const resultado = (cambios: CambioActividad[]): ResultadoDiff => ({
  cambios,
  entidades: [],
  tipo: "mixto",
});

const humano = { actorTipo: "humano" as const, actorNombre: "Ana" };
const ia = { actorTipo: "ia" as const, actorNombre: "IA" };

describe("construirResumen", () => {
  it("describe en singular la creación de una clase", () => {
    const texto = construirResumen(
      resultado([{ accion: "crear", entidadTipo: "clase", entidadKey: "pedido", despues: clasePedido }]),
      humano,
    );

    expect(texto).toBe("Ana creó la clase Pedido");
  });

  it("usa el plural cuando se crean varias clases", () => {
    const texto = construirResumen(
      resultado([
        { accion: "crear", entidadTipo: "clase", entidadKey: "pedido", despues: clasePedido },
        { accion: "crear", entidadTipo: "clase", entidadKey: "cliente", despues: claseCliente },
      ]),
      humano,
    );

    expect(texto).toBe("Ana creó 2 clases");
  });

  it("resume el borrado en cascada como un solo hecho", () => {
    const texto = construirResumen(
      resultado([
        { accion: "eliminar", entidadTipo: "clase", entidadKey: "pedido", antes: clasePedido },
        {
          accion: "eliminar",
          entidadTipo: "relacion",
          entidadKey: relacion.key,
          antes: relacion,
        },
      ]),
      humano,
    );

    expect(texto).toBe("Ana eliminó la clase Pedido y 1 relación");
  });

  it("describe el renombrado con el nombre anterior y el nuevo", () => {
    const texto = construirResumen(
      resultado([
        {
          accion: "actualizar",
          entidadTipo: "clase",
          entidadKey: "pedido",
          campo: "name",
          antes: "Pedido",
          despues: "Orden",
        },
      ]),
      humano,
    );

    expect(texto).toBe("Ana renombró la clase Pedido a Orden");
  });

  it("describe la relación creada con sus extremos y multiplicidades", () => {
    const texto = construirResumen(
      resultado([
        { accion: "crear", entidadTipo: "relacion", entidadKey: relacion.key, despues: relacion },
      ]),
      humano,
    );

    expect(texto).toBe("Ana creó la relación Pedido → Cliente (1 a 0..*)");
  });

  it("no muestra claves internas cuando la relación no tiene datos legibles", () => {
    const tecnica: RelacionSemantica = {
      ...relacion,
      key: "3f2a9c1e-0b4d-4c6f-9a1e-8d7c6b5a4f3e|association|undefined",
      from: "3f2a9c1e-0b4d-4c6f-9a1e-8d7c6b5a4f3e",
      to: "undefined",
    };
    const texto = construirResumen(
      resultado([{ accion: "crear", entidadTipo: "relacion", entidadKey: tecnica.key, despues: tecnica }]),
      humano,
    );

    expect(texto).toBe("Ana creó una relación");
    expect(texto).not.toContain("3f2a9c1e");
  });

  it("muestra el nombre del atributo sin el prefijo de la clase", () => {
    const texto = construirResumen(
      resultado([
        {
          accion: "actualizar",
          entidadTipo: "atributo",
          entidadKey: "pedido.total",
          campo: "type",
          antes: "int",
          despues: "double",
        },
      ]),
      humano,
    );

    expect(texto).toBe("Ana cambió el tipo del atributo total a double");
    expect(texto).not.toContain("pedido.");
  });

  it("atribuye a la IA y menciona a quién la pidió", () => {
    const texto = construirResumen(
      resultado([{ accion: "crear", entidadTipo: "clase", entidadKey: "pedido", despues: clasePedido }]),
      { ...ia, solicitadoPor: { nombre: "Ana" } },
    );

    expect(texto).toBe("La IA creó la clase Pedido a pedido de Ana");
  });

  it("no añade la coletilla cuando el evento no es de la IA", () => {
    const texto = construirResumen(
      resultado([{ accion: "crear", entidadTipo: "clase", entidadKey: "pedido", despues: clasePedido }]),
      { ...humano, solicitadoPor: { nombre: "Ana" } },
    );

    expect(texto).not.toContain("a pedido de");
  });

  it("devuelve cadena vacía cuando no hay cambios", () => {
    expect(construirResumen(resultado([]), humano)).toBe("");
  });
});
