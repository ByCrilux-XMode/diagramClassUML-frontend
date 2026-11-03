import { afterEach, describe, expect, it } from "vitest";
import { executeTool, executeToolSync } from "@/lib/editorTools/tools";
import { origenActual, reiniciarOrigen, withAiOrigin } from "./origen";
import type { OrigenIA } from "./origen";

const origen = (turnoId: string): OrigenIA => ({
  turnoId,
  modelo: "nvidia/nemotron-3.5-lightning:free",
  solicitadoPor: { usuarioId: 7, nombre: "Ana" },
  proyectoId: "42",
});

afterEach(() => {
  reiniciarOrigen();
});

describe("contexto de origen de la IA", () => {
  it("abre el contexto durante la función y lo cierra al salir", () => {
    expect(origenActual()).toBeNull();

    const dentro = withAiOrigin(origen("turno-1"), () => origenActual());

    expect(dentro?.turnoId).toBe("turno-1");
    expect(origenActual()).toBeNull();
  });

  it("una excepción dentro de la función no deja el contexto abierto", () => {
    expect(() =>
      withAiOrigin(origen("turno-2"), () => {
        throw new Error("falla la tool");
      }),
    ).toThrow("falla la tool");

    expect(origenActual()).toBeNull();
  });

  it("anida contextos y restaura el anterior al cerrar el interno", () => {
    withAiOrigin(origen("externo"), () => {
      expect(origenActual()?.turnoId).toBe("externo");

      withAiOrigin(origen("interno"), () => {
        expect(origenActual()?.turnoId).toBe("interno");
      });

      expect(origenActual()?.turnoId).toBe("externo");
    });
  });

  it("executeToolSync sigue siendo síncrono", () => {
    // El flag de origen se abre y se cierra alrededor de una llamada sin
    // `await`. Si esta función pasara a devolver una promesa, el contexto
    // podría filtrarse a una transacción humana posterior.
    const resultado = executeToolSync("getState", {}) as unknown;

    expect(resultado).not.toBeInstanceOf(Promise);
    expect(typeof (resultado as { then?: unknown }).then).not.toBe("function");
  });

  it("las tools de consulta pueden devolver una promesa", async () => {
    const resultado = executeTool("consultarPlan", {}, { proyectoId: null }) as unknown;

    expect(resultado).toBeInstanceOf(Promise);
    await expect(resultado as Promise<{ ok: boolean }>).resolves.toMatchObject({ ok: false });
  });
});
