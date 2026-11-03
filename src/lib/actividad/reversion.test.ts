import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventoActividad } from "./cliente";
import type { CambioActividad } from "./diff";
import type { EstadoSemantico } from "./estado";
import {
  ErrorReversion,
  aplicarReversion,
  capturarEventoReversion,
  configurarEnvioReversion,
  construirResumenReversion,
  construirReversion,
  finalizarCapturaReversion,
  formatearElegibilidadReversion,
  iniciarCapturaReversion,
  reiniciarCapturaReversion,
} from "./reversion";
import type { TurnoIAReversible } from "./reversion";

function evento(
  cambios: CambioActividad[],
  parcial: Partial<EventoActividad> = {},
): EventoActividad {
  return {
    sesionId: "ses-1",
    secuencia: 1,
    actorTipo: "ia",
    actorNombre: "IA",
    origen: "ia",
    tipo: "mixto",
    entidades: cambios.map((cambio) => cambio.entidadKey),
    cambios,
    turnoId: "turno-ia",
    resumen: "La IA cambió el diagrama",
    ocurridoEn: "2026-11-01T10:00:00.000Z",
    ...parcial,
  };
}

function turno(
  eventos: EventoActividad[],
  parcial: Partial<TurnoIAReversible> = {},
): TurnoIAReversible {
  return {
    turnoId: "turno-ia",
    eventos,
    deshacible: true,
    entidades: [...new Set(eventos.flatMap((item) => item.entidades))],
    ...parcial,
  };
}

const clasePedido = {
  key: "pedido",
  name: "Pedido",
  category: "Class" as const,
  isAbstract: false,
  attributes: [{ name: "total", type: "double", visibility: "+" as const }],
  methods: [],
};

const relacionPedido = {
  key: "pedido|association|cliente",
  from: "pedido",
  to: "cliente",
  category: "association" as const,
  fromMultiplicity: "1",
  toMultiplicity: "0..*",
  name: "compra",
};

beforeEach(() => {
  reiniciarCapturaReversion();
});

describe("construirReversion", () => {
  it("invierte una creación de clase quitándola", () => {
    const propuestas = construirReversion(
      turno([
        evento([
          {
            accion: "crear",
            entidadTipo: "clase",
            entidadKey: "pedido",
            despues: clasePedido,
          },
        ]),
      ]),
    );

    expect(propuestas).toEqual([
      expect.objectContaining({
        toolName: "removeClass",
        args: { key: "pedido" },
      }),
    ]);
  });

  it("invierte un borrado de clase restaurándola con su estado anterior", () => {
    const propuestas = construirReversion(
      turno([
        evento([
          {
            accion: "eliminar",
            entidadTipo: "clase",
            entidadKey: "pedido",
            antes: clasePedido,
          },
        ]),
      ]),
    );

    expect(propuestas[0]).toMatchObject({
      toolName: "addClass",
      args: {
        key: "pedido",
        name: "Pedido",
        category: "Class",
        attributes: [{ name: "total", type: "double", visibility: "+" }],
      },
    });
  });

  it("invierte un renombrado de clase con el valor anterior", () => {
    const propuestas = construirReversion(
      turno([
        evento([
          {
            accion: "actualizar",
            entidadTipo: "clase",
            entidadKey: "pedido",
            campo: "name",
            antes: "Pedido",
            despues: "PedidoVenta",
          },
        ]),
      ]),
    );

    expect(propuestas[0]).toMatchObject({
      toolName: "updateClass",
      args: { key: "pedido", name: "Pedido" },
    });
  });

  it("invierte una relación creada y una eliminada", () => {
    const creada = construirReversion(
      turno([
        evento([
          {
            accion: "crear",
            entidadTipo: "relacion",
            entidadKey: relacionPedido.key,
            despues: relacionPedido,
          },
        ]),
      ]),
    );
    expect(creada[0]).toMatchObject({
      toolName: "updateRelation",
      args: { action: "remove", from: "pedido", to: "cliente" },
    });

    const eliminada = construirReversion(
      turno([
        evento([
          {
            accion: "eliminar",
            entidadTipo: "relacion",
            entidadKey: relacionPedido.key,
            antes: relacionPedido,
          },
        ]),
      ]),
    );
    expect(eliminada[0]).toMatchObject({
      toolName: "connect",
      args: {
        from: "pedido",
        to: "cliente",
        kind: "association",
        fromMult: "1",
        toMult: "0..*",
        label: "compra",
      },
    });
  });

  it("invierte crear, actualizar y eliminar atributos", () => {
    const propuestas = construirReversion(
      turno([
        evento([
          {
            accion: "crear",
            entidadTipo: "atributo",
            entidadKey: "pedido.total",
            despues: { name: "total", type: "double", visibility: "+" },
          },
          {
            accion: "actualizar",
            entidadTipo: "atributo",
            entidadKey: "pedido.estado",
            campo: "type",
            antes: "string",
            despues: "Estado",
          },
          {
            accion: "eliminar",
            entidadTipo: "atributo",
            entidadKey: "pedido.cliente",
            antes: { name: "cliente", type: "Cliente", visibility: "+" },
          },
        ]),
      ]),
    );

    expect(propuestas.map((propuesta) => propuesta.toolName)).toEqual([
      "updateAttribute",
      "updateAttribute",
      "updateAttribute",
    ]);
    expect(propuestas).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          args: {
            classKey: "pedido",
            action: "remove",
            attribute: { name: "total" },
          },
        }),
        expect.objectContaining({
          args: {
            classKey: "pedido",
            action: "update",
            attribute: { name: "estado", type: "string" },
          },
        }),
        expect.objectContaining({
          args: {
            classKey: "pedido",
            action: "add",
            attribute: { name: "cliente", type: "Cliente", visibility: "+" },
          },
        }),
      ]),
    );
  });

  it("aplica el orden inverso entre eventos y respeta dependencias dentro de uno", () => {
    const primero = evento(
      [
        {
          accion: "crear",
          entidadTipo: "clase",
          entidadKey: "cliente",
          despues: { key: "cliente", name: "Cliente", category: "Class" },
        },
      ],
      { secuencia: 1, ocurridoEn: "2026-11-01T10:00:00.000Z" },
    );
    const segundo = evento(
      [
        {
          accion: "eliminar",
          entidadTipo: "clase",
          entidadKey: "pedido",
          antes: clasePedido,
        },
        {
          accion: "eliminar",
          entidadTipo: "relacion",
          entidadKey: relacionPedido.key,
          antes: relacionPedido,
        },
      ],
      { secuencia: 2, ocurridoEn: "2026-11-01T10:00:01.000Z" },
    );

    const propuestas = construirReversion(turno([primero, segundo]));

    // Primero el evento más reciente (restaurar clase y luego reconectar) y al
    // final el evento más antiguo (quitar la clase creada).
    expect(propuestas.map((propuesta) => propuesta.toolName)).toEqual([
      "addClass",
      "connect",
      "removeClass",
    ]);
  });

  it("rechaza un turno no reversible y un cambio sin valor anterior", () => {
    expect(() =>
      construirReversion(turno([], { deshacible: false, motivo: "editado después" })),
    ).toThrow(ErrorReversion);

    expect(() =>
      construirReversion(
        turno([
          evento([
            {
              accion: "actualizar",
              entidadTipo: "clase",
              entidadKey: "pedido",
              campo: "name",
              despues: "Pedido",
            },
          ]),
        ]),
      ),
    ).toThrow(/valor anterior/);
  });
});

describe("aplicarReversion", () => {
  const estado: EstadoSemantico = {
    clases: new Map([
      [
        "pedido",
        {
          key: "pedido",
          name: "Pedido",
          category: "Class",
          attributes: [{ name: "total", type: "double", visibility: "+" }],
          methods: [],
        },
      ],
    ]),
    relaciones: new Map(),
  };

  it("fusiona el campo invertido con el atributo actual y aplica en orden", () => {
    const ejecutadas: Array<{ toolName: string; args: Record<string, unknown> }> = [];
    const resultado = aplicarReversion(
      [
        {
          id: "1",
          toolName: "updateAttribute",
          round: 0,
          args: {
            classKey: "pedido",
            action: "update",
            attribute: { name: "total", type: "int" },
          },
        },
      ],
      {
        leerEstado: () => estado,
        ejecutar: (toolName, args) => {
          ejecutadas.push({ toolName, args });
          return { ok: true };
        },
      },
    );

    expect(resultado).toMatchObject({ aplicadas: 1, errores: [] });
    expect(ejecutadas[0].args).toMatchObject({
      attribute: { name: "total", type: "int", visibility: "+" },
    });
  });

  it("se detiene en el primer error y no cuenta los pasos restantes", () => {
    const ejecutar = vi
      .fn()
      .mockReturnValueOnce({ ok: true })
      .mockReturnValueOnce({ ok: false, error: "no existe" });

    const resultado = aplicarReversion(
      [
        { id: "1", toolName: "removeClass", round: 0, args: { key: "a" } },
        { id: "2", toolName: "removeClass", round: 0, args: { key: "b" } },
        { id: "3", toolName: "removeClass", round: 0, args: { key: "c" } },
      ],
      { leerEstado: () => estado, ejecutar },
    );

    expect(resultado.aplicadas).toBe(1);
    expect(resultado.errores).toEqual(["no existe"]);
    expect(ejecutar).toHaveBeenCalledTimes(2);
  });
});

describe("captura y registro de la reversión", () => {
  const base = evento(
    [
      {
        accion: "crear",
        entidadTipo: "clase",
        entidadKey: "pedido",
        despues: clasePedido,
      },
    ],
    { actorTipo: "humano", actorNombre: "Ana", origen: "manual", turnoId: null },
  );

  it("sin captura activa no retiene eventos", () => {
    expect(capturarEventoReversion(base)).toBe(false);
  });

  it("en éxito marca todos los eventos con el turno nuevo y revierteTurnoId", async () => {
    const enviados: EventoActividad[] = [];
    configurarEnvioReversion((eventos) => {
      enviados.push(...eventos);
    });
    iniciarCapturaReversion({
      turnoId: "turno-reversion",
      revierteTurnoId: "turno-ia",
      autor: { usuarioId: 7, nombre: "Ana" },
      resumen: "Ana deshizo el lote de la IA del 01 nov 2026: restauró 1 entidad.",
    });

    expect(capturarEventoReversion(base)).toBe(true);
    expect(capturarEventoReversion({ ...base, secuencia: 2 })).toBe(true);
    const finales = await finalizarCapturaReversion(true);

    expect(finales).toHaveLength(2);
    expect(finales[0]).toMatchObject({
      actorTipo: "humano",
      actorUsuarioId: 7,
      actorNombre: "Ana",
      origen: "manual",
      turnoId: "turno-reversion",
      revierteTurnoId: "turno-ia",
      resumen: "Ana deshizo el lote de la IA del 01 nov 2026: restauró 1 entidad.",
    });
    expect(enviados).toHaveLength(2);
  });

  it("en fallo a mitad deja los cambios como turno humano normal", async () => {
    iniciarCapturaReversion({
      turnoId: "turno-reversion",
      revierteTurnoId: "turno-ia",
      autor: { usuarioId: 7, nombre: "Ana" },
      resumen: "Ana deshizo el lote de la IA.",
    });

    capturarEventoReversion(base);
    const finales = await finalizarCapturaReversion(false);

    expect(finales[0]).toMatchObject({
      actorTipo: "humano",
      turnoId: null,
      revierteTurnoId: null,
      actorNombre: "Ana",
    });
  });
});

describe("construirResumenReversion", () => {
  it("indica la fecha del lote y cuántas entidades se restauraron", () => {
    const resumen = construirResumenReversion(
      turno([], { entidades: ["pedido", "cliente"] }),
      { usuarioId: 7, nombre: "Ana" },
    );

    expect(resumen).toContain("Ana deshizo el lote de la IA");
    expect(resumen).toContain("2 entidades");
  });
});

describe("formatearElegibilidadReversion", () => {
  const reversible = turno([
    evento(
      [
        {
          accion: "crear",
          entidadTipo: "clase",
          entidadKey: "pedido",
          despues: clasePedido,
        },
        {
          accion: "crear",
          entidadTipo: "relacion",
          entidadKey: relacionPedido.key,
          despues: relacionPedido,
        },
      ],
      { entidades: ["pedido", "cliente"] },
    ),
  ]);

  it("oculta la acción a un LECTOR aunque el turno sea reversible", () => {
    expect(formatearElegibilidadReversion(reversible, false)).toEqual({
      mostrarBoton: false,
      motivo: null,
      cambios: 0,
    });
  });

  it("no ofrece nada cuando el proyecto no tiene turnos de IA", () => {
    const vacio = turno([], { turnoId: null, deshacible: false, motivo: "Sin turnos." });

    expect(formatearElegibilidadReversion(vacio, true)).toEqual({
      mostrarBoton: false,
      motivo: null,
      cambios: 0,
    });
  });

  it("muestra el botón y cuenta los cambios cuando es reversible", () => {
    expect(formatearElegibilidadReversion(reversible, true)).toEqual({
      mostrarBoton: true,
      motivo: null,
      cambios: 2,
    });
  });

  it("explica el motivo y no muestra el botón cuando no es reversible", () => {
    const noReversible = turno([], {
      deshacible: false,
      motivo: "Una entidad cambió después.",
    });

    expect(formatearElegibilidadReversion(noReversible, true)).toEqual({
      mostrarBoton: false,
      motivo: "Una entidad cambió después.",
      cambios: 0,
    });
  });
});
