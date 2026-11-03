import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderProfile } from "../providers";
import { armarContexto, logContextoCapas } from "./builder";
import type { FuentesContexto } from "./builder";

const perfil: ProviderProfile = {
  id: "ollama",
  contextWindow: 200_000,
  maxOutput: 2_048,
};

const fuentes: FuentesContexto = {
  colaboradores: [
    { usuarioId: 1, nombre: "Ana Pérez", rol: "CREADOR", username: "ana" },
    { usuarioId: 2, nombre: "Luis Gómez", rol: "LECTOR" },
  ],
  actividad: [
    {
      creadoEn: "2026-10-30T12:00:00.000Z",
      actorNombre: "Ana Pérez",
      actorTipo: "humano",
      tipo: "clase.crear",
      resumen: "Creó la clase Pedido",
      entidades: ["pedido"],
    },
  ],
  plan: {
    version: 3,
    contenido: "Usar arquitectura en capas. Pedido es la raíz.",
    autorNombre: "Ana Pérez",
    creadoEn: "2026-10-29T12:00:00.000Z",
    origen: "humano",
  },
  resumen: {
    texto: "El equipo acordó separar el dominio de la infraestructura.",
    hastaCreadoEn: "2026-10-30T11:00:00.000Z",
    modelo: "modelo-barato",
  },
  mensajes: [
    { role: "user", content: "Mensaje anterior", creadoEn: "2026-10-30T11:30:00.000Z" },
    { role: "assistant", content: "Respuesta anterior", creadoEn: "2026-10-30T11:31:00.000Z" },
  ],
};

const armar = (extra: Partial<Parameters<typeof armarContexto>[0]> = {}) =>
  armarContexto({
    fuentes,
    ambito: "grupo",
    modo: "plan",
    rol: "CREADOR",
    perfil,
    tools: [],
    mensajeActual: "¿Qué acordamos?",
    ...extra,
  });

describe("armarContexto", () => {
  it("incluye las seis capas en orden y reporta tokens por capa", () => {
    const { systemPrompt, capas } = armar();

    expect(capas.map((capa) => capa.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(capas.every((capa) => capa.tokens >= 0)).toBe(true);
    expect(systemPrompt.indexOf("Capa 1")).toBeLessThan(systemPrompt.indexOf("Capa 2"));
    expect(systemPrompt.indexOf("Capa 6")).toBeGreaterThan(systemPrompt.indexOf("Capa 5"));
  });

  it("inyecta el plan vigente con su versión y autor", () => {
    const { systemPrompt } = armar();

    expect(systemPrompt).toContain("Versión 3");
    expect(systemPrompt).toContain("Ana Pérez");
    expect(systemPrompt).toContain("arquitectura en capas");
  });

  it("el ámbito privado nunca incluye el resumen del grupo y usa el historial local", () => {
    const { systemPrompt, history } = armar({
      fuentes: { ...fuentes, mensajes: [{ role: "user", content: "Consulta local" }] },
      ambito: "privado",
      modo: "plan",
      rol: "LECTOR",
    });

    expect(systemPrompt).not.toContain("separar el dominio");
    expect(systemPrompt).not.toContain("Mensaje anterior");
    expect(history.map((mensaje) => mensaje.content)).toEqual(["Consulta local"]);
    expect(systemPrompt).toContain("Ámbito privado");
  });

  it("excluye del historial lo que el resumen ya cubre", () => {
    const { history } = armar({
      fuentes: {
        ...fuentes,
        mensajes: [
          { role: "user", content: "Cubierto", creadoEn: "2026-10-30T10:00:00.000Z" },
          { role: "user", content: "Nuevo", creadoEn: "2026-10-30T12:00:00.000Z" },
        ],
      },
    });

    expect(history.map((mensaje) => mensaje.content)).toEqual(["Nuevo"]);
  });

  it("propaga las fuentes degradadas al diagnóstico", () => {
    const { degradado, capas } = armar({
      fuentes: { ...fuentes, degradado: ["actividad"] },
    });

    expect(degradado).toEqual(["actividad"]);
    expect(capas).toHaveLength(6);
  });

  it("con presupuesto ajustado recorta capas pero conserva la 1 y el mensaje actual", () => {
    const { capas } = armar({
      perfil: { id: "hf-space", contextWindow: 1_200, maxOutput: 512 },
    });

    expect(capas[0].id).toBe(1);
    expect(capas[0].tokens).toBeGreaterThan(0);
    expect(capas[0].recortada).toBe(false);
  });

  it("solo emite el diagnóstico por consola con IA_DEBUG_CONTEXT=1", () => {
    const espia = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const original = process.env.IA_DEBUG_CONTEXT;
    const capas = [{ id: 1 as const, nombre: "Rol y modo", tokens: 10, recortada: false }];

    process.env.IA_DEBUG_CONTEXT = "0";
    logContextoCapas(capas, [], 3_600);
    expect(espia).not.toHaveBeenCalled();

    process.env.IA_DEBUG_CONTEXT = "1";
    logContextoCapas(capas, [], 3_600);
    expect(espia).toHaveBeenCalled();

    espia.mockRestore();
    if (original === undefined) delete process.env.IA_DEBUG_CONTEXT;
    else process.env.IA_DEBUG_CONTEXT = original;
  });
});
