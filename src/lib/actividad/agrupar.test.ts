import { describe, expect, it } from "vitest";
import { agruparEventos } from "./agrupar";
import type { EventoActividad } from "./cliente";

const evento = (parcial: Partial<EventoActividad> & { secuencia: number }): EventoActividad => ({
  sesionId: "ses-1",
  actorTipo: "humano",
  actorNombre: "Ana",
  tipo: "clase.crear",
  entidades: ["pedido"],
  cambios: [{ accion: "crear", entidadTipo: "clase", entidadKey: "pedido" }],
  resumen: "Ana creó la clase Pedido",
  ...parcial,
});

describe("agruparEventos", () => {
  it("pliega un turno de tres eventos en una sola fila", () => {
    const filas = agruparEventos([
      evento({ secuencia: 1, turnoId: "turno-1", ocurridoEn: "2026-10-30T10:00:00.000Z" }),
      evento({ secuencia: 2, turnoId: "turno-1", ocurridoEn: "2026-10-30T10:00:01.000Z" }),
      evento({ secuencia: 3, turnoId: "turno-1", ocurridoEn: "2026-10-30T10:00:02.000Z" }),
    ]);

    expect(filas).toHaveLength(1);
    expect(filas[0].tipo).toBe("grupo");
    if (filas[0].tipo === "grupo") {
      expect(filas[0].turnoId).toBe("turno-1");
      expect(filas[0].eventos.map((item) => item.secuencia)).toEqual([1, 2, 3]);
    }
  });

  it("no agrupa un turno con un único evento", () => {
    const filas = agruparEventos([evento({ secuencia: 1, turnoId: "turno-solo" })]);

    expect(filas).toHaveLength(1);
    expect(filas[0].tipo).toBe("evento");
  });

  it("deja como fila suelta el evento humano sin turno", () => {
    const filas = agruparEventos([evento({ secuencia: 1 })]);

    expect(filas).toHaveLength(1);
    expect(filas[0].tipo).toBe("evento");
  });

  it("ordena los eventos del grupo del más antiguo al más reciente", () => {
    const filas = agruparEventos([
      evento({ secuencia: 3, turnoId: "turno-2", ocurridoEn: "2026-10-30T10:00:03.000Z" }),
      evento({ secuencia: 1, turnoId: "turno-2", ocurridoEn: "2026-10-30T10:00:01.000Z" }),
      evento({ secuencia: 2, turnoId: "turno-2", ocurridoEn: "2026-10-30T10:00:02.000Z" }),
    ]);

    const grupo = filas[0];
    expect(grupo.tipo).toBe("grupo");
    if (grupo.tipo === "grupo") {
      expect(grupo.eventos.map((item) => item.secuencia)).toEqual([1, 2, 3]);
    }
  });
});
