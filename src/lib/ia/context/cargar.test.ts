import { beforeEach, describe, expect, it, vi } from "vitest";
import { cargarFuentes } from "./cargar";

const mocks = vi.hoisted(() => ({
  listarColaboradores: vi.fn(),
  listarEventos: vi.fn(),
  listarPlanes: vi.fn(),
  obtenerSala: vi.fn(),
  historialContexto: vi.fn(),
}));

vi.mock("@/lib/colaboradores", () => ({ listarColaboradores: mocks.listarColaboradores }));
vi.mock("@/lib/actividad/api", () => ({ listarEventos: mocks.listarEventos }));
vi.mock("@/lib/planes/api", () => ({ listarPlanes: mocks.listarPlanes }));
vi.mock("@/lib/chat/api", () => ({
  obtenerSala: mocks.obtenerSala,
  historialContexto: mocks.historialContexto,
}));

const sala = {
  _id: "sala-1",
  proyectoId: 7,
  tipo: "grupo" as const,
  creadaEn: "2026-10-01T00:00:00.000Z",
  resumen: {
    texto: "Acuerdo",
    hastaMensajeId: "m1",
    hastaCreadoEn: "2026-10-30T10:00:00.000Z",
    modelo: null,
    actualizadoEn: "2026-10-30T10:00:00.000Z",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listarColaboradores.mockResolvedValue([
    {
      usuarioId: 1,
      proyectoId: 7,
      permisoId: 1,
      permiso: { permisoId: 1, nombre: "CREADOR" },
      usuario: {
        usuarioId: 1,
        username: "ana",
        personaId: 1,
        persona: { personaId: 1, nombre: "Ana", apellido: "Pérez" },
      },
    },
  ]);
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
      },
    ],
    siguiente: null,
  });
  mocks.listarPlanes.mockResolvedValue({
    vigente: {
      _id: "p1",
      proyectoId: 7,
      version: 2,
      contenido: "Plan",
      autorUsuarioId: 1,
      autorNombre: "Ana Pérez",
      origen: "humano",
      sustituyeA: null,
      creadoEn: "2026-10-29T10:00:00.000Z",
    },
    planes: [],
  });
  mocks.obtenerSala.mockResolvedValue(sala);
  mocks.historialContexto.mockResolvedValue([
    {
      _id: "m1",
      salaId: "sala-1",
      proyectoId: 7,
      tipo: "texto",
      autorTipo: "humano",
      autorUsuarioId: 1,
      autorNombre: "Ana",
      modelo: null,
      contenido: "Hola",
      suceso: null,
      turnoId: null,
      solicitadoPor: null,
      creadoEn: "2026-10-30T10:00:00.000Z",
    },
    {
      _id: "m2",
      salaId: "sala-1",
      proyectoId: 7,
      tipo: "texto",
      autorTipo: "ia",
      autorUsuarioId: null,
      autorNombre: "IA",
      modelo: "m",
      contenido: "Respuesta",
      suceso: null,
      turnoId: "t1",
      solicitadoPor: null,
      creadoEn: "2026-10-30T11:00:00.000Z",
    },
  ]);
});

describe("cargarFuentes", () => {
  it("mapea las fuentes y excluye el mensaje que disparó el turno", async () => {
    const fuentes = await cargarFuentes(7, {
      incluirConversacion: true,
      excluirMensajeId: "m2",
    });

    expect(fuentes.colaboradores?.[0]).toMatchObject({
      nombre: "Ana Pérez",
      rol: "CREADOR",
    });
    expect(fuentes.actividad?.[0].resumen).toBe("Creó Pedido");
    expect(fuentes.plan?.version).toBe(2);
    expect(fuentes.resumen?.texto).toBe("Acuerdo");
    expect(fuentes.mensajes).toHaveLength(1);
    expect(fuentes.mensajes?.[0].content).toBe("Hola");
    expect(fuentes.degradado).toEqual([]);
  });

  it("una fuente caída no tumba el turno y queda en degradado", async () => {
    mocks.listarEventos.mockRejectedValue(new Error("503"));

    const fuentes = await cargarFuentes(7, { incluirConversacion: false });

    expect(fuentes.degradado).toEqual(["actividad"]);
    expect(fuentes.plan?.version).toBe(2);
    expect(fuentes.colaboradores).toHaveLength(1);
    expect(fuentes.mensajes).toBeUndefined();
    expect(mocks.historialContexto).not.toHaveBeenCalled();
    expect(mocks.obtenerSala).not.toHaveBeenCalled();
  });

  it("sin proyecto activo no llama a la red", async () => {
    const fuentes = await cargarFuentes(null, { incluirConversacion: true });

    expect(fuentes.degradado).toEqual(["proyecto"]);
    expect(mocks.listarColaboradores).not.toHaveBeenCalled();
  });
});
