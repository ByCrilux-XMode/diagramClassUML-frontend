import { beforeEach, describe, expect, it, vi } from "vitest";
import { consultarHistorialTool } from "./consultarHistorial";

const mocks = vi.hoisted(() => ({ listarEventos: vi.fn() }));

vi.mock("@/lib/actividad/api", () => ({ listarEventos: mocks.listarEventos }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listarEventos.mockResolvedValue({
    datos: [
      {
        _id: "e1",
        proyectoId: 7,
        creadoEn: "2026-10-30T11:00:00.000Z",
        actorNombre: "Ana Pérez",
        actorTipo: "humano",
        tipo: "clase.crear",
        resumen: "Creó Pedido",
        entidades: ["pedido"],
        turnoId: null,
        cambios: [{ accion: "crear", entidadTipo: "clase", entidadKey: "pedido" }],
      },
    ],
    siguiente: null,
  });
});

describe("consultarHistorial", () => {
  it("exige al menos un filtro para acotar la consulta", () => {
    const resultado = consultarHistorialTool.validate({});

    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toContain("al menos un filtro");
  });

  it("rechaza fechas inválidas y rangos invertidos", () => {
    const invalida = consultarHistorialTool.validate({ desde: "no-es-fecha" });
    const invertida = consultarHistorialTool.validate({
      desde: "2026-10-31T00:00:00.000Z",
      hasta: "2026-10-01T00:00:00.000Z",
    });

    expect(invalida.ok).toBe(false);
    expect(invertida.ok).toBe(false);
  });

  it("acota el límite al máximo permitido", () => {
    const resultado = consultarHistorialTool.validate({ actor: "Ana", limite: 500 });

    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.value.limite).toBe(50);
  });

  it("devuelve eventos compactos y sin el detalle de cambios", async () => {
    const resultado = await consultarHistorialTool.execute(
      { actor: "Ana Pérez", limite: 20 },
      { proyectoId: 7 },
    );

    expect(resultado.ok).toBe(true);
    const evento = (resultado.data as { eventos: Array<Record<string, unknown>> }).eventos[0];
    expect(evento).toMatchObject({
      actor: "Ana Pérez",
      tipo: "clase.crear",
      resumen: "Creó Pedido",
    });
    expect(evento).not.toHaveProperty("cambios");
    expect(mocks.listarEventos).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ actorNombre: "Ana Pérez", limite: 20 }),
    );
  });

  it("sin proyecto activo devuelve un fallo legible", async () => {
    const resultado = await consultarHistorialTool.execute({ actor: "Ana" }, { proyectoId: null });

    expect(resultado.ok).toBe(false);
    expect(mocks.listarEventos).not.toHaveBeenCalled();
  });
});
