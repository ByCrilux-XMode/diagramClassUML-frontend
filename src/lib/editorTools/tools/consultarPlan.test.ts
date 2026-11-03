import { beforeEach, describe, expect, it, vi } from "vitest";
import { MARCA_PLAN_TRUNCADO, MAX_CARACTERES_PLAN, consultarPlanTool } from "./consultarPlan";

const mocks = vi.hoisted(() => ({
  listarPlanes: vi.fn(),
  obtenerPlanVersion: vi.fn(),
}));

vi.mock("@/lib/planes/api", () => ({
  listarPlanes: mocks.listarPlanes,
  obtenerPlanVersion: mocks.obtenerPlanVersion,
}));

const plan = {
  _id: "p1",
  proyectoId: 7,
  version: 4,
  contenido: "Plan vigente",
  autorUsuarioId: 1,
  autorNombre: "Ana Pérez",
  origen: "humano",
  sustituyeA: 3,
  creadoEn: "2026-10-29T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listarPlanes.mockResolvedValue({ vigente: plan, planes: [plan] });
  mocks.obtenerPlanVersion.mockResolvedValue({ ...plan, version: 2, contenido: "Versión dos" });
});

describe("consultarPlan", () => {
  it("sin versión devuelve el plan vigente", async () => {
    const resultado = await consultarPlanTool.execute({}, { proyectoId: 7 });

    expect(resultado.ok).toBe(true);
    expect((resultado.data as { plan: { version: number } }).plan.version).toBe(4);
    expect(mocks.listarPlanes).toHaveBeenCalledWith(7, 1);
  });

  it("con versión devuelve esa versión concreta", async () => {
    const resultado = await consultarPlanTool.execute({ version: 2 }, { proyectoId: 7 });

    expect(resultado.ok).toBe(true);
    expect((resultado.data as { plan: { contenido: string } }).plan.contenido).toBe("Versión dos");
    expect(mocks.obtenerPlanVersion).toHaveBeenCalledWith(7, 2);
  });

  it("sin plan guardado devuelve null, no un fallo", async () => {
    mocks.listarPlanes.mockResolvedValue({ vigente: null, planes: [] });

    const resultado = await consultarPlanTool.execute({}, { proyectoId: 7 });

    expect(resultado.ok).toBe(true);
    expect((resultado.data as { plan: null }).plan).toBeNull();
  });

  it("recorta planes largos y lo marca", async () => {
    mocks.listarPlanes.mockResolvedValue({
      vigente: { ...plan, contenido: "x".repeat(MAX_CARACTERES_PLAN + 100) },
      planes: [],
    });

    const resultado = await consultarPlanTool.execute({}, { proyectoId: 7 });
    const devuelto = (resultado.data as { plan: { contenido: string; truncado: boolean } }).plan;

    expect(devuelto.truncado).toBe(true);
    expect(devuelto.contenido.endsWith(MARCA_PLAN_TRUNCADO)).toBe(true);
  });

  it("valida la versión y exige proyecto activo", async () => {
    expect(consultarPlanTool.validate({ version: 0 }).ok).toBe(false);
    expect(consultarPlanTool.validate({ version: 1.5 }).ok).toBe(false);

    const resultado = await consultarPlanTool.execute({}, { proyectoId: null });
    expect(resultado.ok).toBe(false);
  });
});
