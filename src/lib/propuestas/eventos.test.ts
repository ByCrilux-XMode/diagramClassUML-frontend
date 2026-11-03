import { describe, expect, it } from "vitest";
import { aplicarEventoPropuesta, fusionarTurnos, turnoDesdePropuestas } from "./eventos";
import type { PropuestaApi, TurnoPendiente } from "./tipos";

function propuesta(
  clave: string,
  turnoId: string,
  round: number,
  creadoEn: string,
  estado: PropuestaApi["estado"] = "pendiente",
): PropuestaApi {
  return {
    _id: `doc-${clave}`,
    proyectoId: 7,
    turnoId,
    mensajeId: null,
    clavePropuesta: clave,
    toolName: "addClass",
    args: { key: clave },
    round,
    estado,
    solicitadoPor: { usuarioId: 1, nombre: "Ana" },
    modelo: "modelo-x",
    aprobadoPor: null,
    reclamadaEn: null,
    resueltaEn: null,
    resultado: null,
    creadoEn,
  };
}

const turno = (turnoId: string, creadoEn: string): TurnoPendiente => ({
  turnoId,
  estado: "pendiente",
  mensajeId: null,
  solicitadoPor: { usuarioId: 1, nombre: "Ana" },
  modelo: "modelo-x",
  aprobadoPor: null,
  reclamadaEn: null,
  resueltaEn: null,
  resultado: null,
  creadoEn,
  resumen: "1 cambio(s): addClass",
  propuestas: [propuesta("a", turnoId, 0, creadoEn)],
});

describe("turnoDesdePropuestas", () => {
  it("ordena por ronda y resume las herramientas", () => {
    const construido = turnoDesdePropuestas([
      propuesta("b", "turno-1", 1, "2026-10-30T12:00:02.000Z"),
      propuesta("a", "turno-1", 0, "2026-10-30T12:00:01.000Z"),
    ]);

    expect(construido?.propuestas.map((p) => p.clavePropuesta)).toEqual(["a", "b"]);
    expect(construido?.resumen).toBe("2 cambio(s): addClass");
  });

  it("devuelve null sin propuestas", () => {
    expect(turnoDesdePropuestas([])).toBeNull();
  });
});

describe("aplicarEventoPropuesta", () => {
  it("ignora eventos de chat y tipos desconocidos", () => {
    const actuales = [turno("turno-1", "2026-10-30T12:00:00.000Z")];

    expect(aplicarEventoPropuesta(actuales, { tipo: "mensaje.creado", mensaje: {} })).toBe(actuales);
    expect(aplicarEventoPropuesta(actuales, { tipo: "otro.evento" })).toBe(actuales);
    expect(aplicarEventoPropuesta(actuales, null)).toBe(actuales);
  });

  it("fusiona un turno creado por SSE sin duplicarlo", () => {
    const creada = {
      tipo: "propuesta.creada" as const,
      turnoId: "turno-1",
      propuestas: [propuesta("a", "turno-1", 0, "2026-10-30T12:00:00.000Z")],
    };

    const primera = aplicarEventoPropuesta([], creada);
    const segunda = aplicarEventoPropuesta(primera, creada);

    expect(primera).toHaveLength(1);
    expect(segunda).toHaveLength(1);
    expect(segunda[0].estado).toBe("pendiente");
  });

  it("actualiza el estado cuando otro EDITOR resuelve el turno", () => {
    const actuales = [turno("turno-1", "2026-10-30T12:00:00.000Z")];

    const actualizados = aplicarEventoPropuesta(actuales, {
      tipo: "propuesta.resuelta",
      turnoId: "turno-1",
      estado: "aplicada",
      aprobadoPor: { usuarioId: 9, nombre: "Luis" },
      resultado: { aplicadas: 1, errores: [] },
    });

    expect(actualizados[0].estado).toBe("aplicada");
    expect(actualizados[0].aprobadoPor?.nombre).toBe("Luis");
  });
});

describe("fusionarTurnos", () => {
  it("ordena por antigüedad y reemplaza por turnoId", () => {
    const fusionados = fusionarTurnos(
      [turno("nuevo", "2026-10-30T12:00:00.000Z")],
      [turno("viejo", "2026-10-29T12:00:00.000Z")],
    );

    expect(fusionados.map((t) => t.turnoId)).toEqual(["viejo", "nuevo"]);
  });
});
