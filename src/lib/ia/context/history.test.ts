import { describe, expect, it } from "vitest";
import { esRelleno, toHistory } from "./history";

describe("toHistory", () => {
  it("excluye los avisos de la interfaz", () => {
    const historial = toHistory(
      [
        { role: "user", content: "crea Usuario" },
        { role: "assistant", content: "Listo." },
        { role: "system", content: "✓ Aplicados 2 cambio(s) al diagrama." },
        { role: "user", content: "agrégale email" },
      ],
      6,
    );
    expect(historial.map((m) => m.content)).toEqual(["crea Usuario", "Listo.", "agrégale email"]);
  });

  it("excluye respuestas vacías y marcadores de relleno", () => {
    const historial = toHistory(
      [
        { role: "user", content: "hola" },
        { role: "assistant", content: "Sin respuesta del modelo." },
        { role: "assistant", content: "   " },
        { role: "user", content: "crea Pedido" },
        { role: "assistant", content: "Hecho." },
      ],
      6,
    );
    expect(historial.map((m) => m.content)).toEqual(["hola", "crea Pedido", "Hecho."]);
  });

  it("conserva solo los últimos N turnos completos", () => {
    const entradas = [
      { role: "user" as const, content: "turno 1" },
      { role: "assistant" as const, content: "r1" },
      { role: "user" as const, content: "turno 2" },
      { role: "assistant" as const, content: "r2" },
      { role: "user" as const, content: "turno 3" },
      { role: "assistant" as const, content: "r3" },
    ];
    expect(toHistory(entradas, 2).map((m) => m.content)).toEqual([
      "turno 2",
      "r2",
      "turno 3",
      "r3",
    ]);
  });

  it("detecta los rellenos conocidos", () => {
    expect(esRelleno("Sin respuesta del modelo.")).toBe(true);
    expect(esRelleno("El asistente no respondió: timeout")).toBe(true);
    expect(esRelleno("Propuesta lista para revisión humana.")).toBe(true);
    expect(esRelleno("He creado la clase Pedido.")).toBe(false);
  });
});
