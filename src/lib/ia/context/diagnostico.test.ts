import { describe, expect, it } from "vitest";
import { formatearContexto, formatearPlanVigente } from "./diagnostico";
import type { Plan } from "@/lib/planes/api";

const contextoBase = {
  tokensEstimados: 1_200,
  presupuestoEntrada: 3_600,
  ventana: 4_096,
  bloquesEliminados: 2,
  truncados: 1,
};

describe("formatearContexto", () => {
  it("resume tokens por capa y marca las recortadas", () => {
    const { texto, titulo, degradado } = formatearContexto({
      ...contextoBase,
      capas: [
        { id: 1, nombre: "Rol y modo", tokens: 80, recortada: false },
        { id: 4, nombre: "Actividad reciente", tokens: 300, recortada: true },
      ],
    });

    expect(texto).toContain("2 capas");
    expect(texto).toContain("2 bloque(s) fuera");
    expect(titulo).toContain("Capa 4 · Actividad reciente: 300 tok (recortada)");
    expect(degradado).toBe(false);
  });

  it("marca el diagnóstico cuando hay fuentes degradadas", () => {
    const { texto, titulo, degradado } = formatearContexto({
      ...contextoBase,
      degradado: ["actividad", "plan"],
    });

    expect(degradado).toBe(true);
    expect(texto).toContain("degradado: actividad, plan");
    expect(titulo).toContain("Sin cargar: actividad, plan");
  });
});

describe("formatearPlanVigente", () => {
  const plan: Plan = {
    _id: "p1",
    proyectoId: 7,
    version: 3,
    contenido: "Plan",
    autorUsuarioId: 1,
    autorNombre: "Ana Pérez",
    origen: "humano",
    sustituyeA: 2,
    creadoEn: "2026-10-29T12:00:00.000Z",
  };

  it("muestra versión, autor y fecha en solo lectura", () => {
    const texto = formatearPlanVigente(plan);

    expect(texto).toContain("v3");
    expect(texto).toContain("Ana Pérez");
    expect(texto).toContain("2026");
  });

  it("explica qué hacer cuando no hay plan", () => {
    expect(formatearPlanVigente(null)).toContain("Sin plan guardado");
  });
});
