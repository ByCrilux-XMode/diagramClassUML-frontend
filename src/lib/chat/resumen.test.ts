import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MensajeChat, ResumenSalaChat } from "@/lib/chat/api";
import {
  armarPromptResumen,
  debeResumir,
  mensajesPendientes,
  quizasResumirSala,
} from "./resumen";

const mocks = vi.hoisted(() => ({
  actualizarResumen: vi.fn(),
  chatConFallback: vi.fn(),
}));

vi.mock("@/lib/chat/api", () => ({ actualizarResumen: mocks.actualizarResumen }));
vi.mock("@/lib/ia/fallback", () => ({ chatConFallback: mocks.chatConFallback }));

function mensaje(id: string, creadoEn: string, contenido = `texto ${id}`): MensajeChat {
  return {
    _id: id,
    salaId: "sala-1",
    proyectoId: 7,
    tipo: "texto",
    autorTipo: "humano",
    autorUsuarioId: 1,
    autorNombre: "Ana",
    modelo: null,
    contenido,
    suceso: null,
    turnoId: null,
    solicitadoPor: null,
    creadoEn,
  };
}

const resumen: ResumenSalaChat = {
  texto: "Resumen anterior",
  hastaMensajeId: "m2",
  hastaCreadoEn: "2026-10-30T10:00:00.000Z",
  modelo: null,
  actualizadoEn: "2026-10-30T10:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.chatConFallback.mockResolvedValue({
    content: "Resumen nuevo",
    toolCalls: [],
    proveedorUsado: "hf-space",
    modeloUsado: "resumen/modelo",
    fallbacks: [],
    intento: { messages: [], tools: [] },
  });
  mocks.actualizarResumen.mockResolvedValue({ sala: {}, actualizado: true });
});

describe("resumen rodante", () => {
  it("solo considera mensajes de texto posteriores al resumen vigente", () => {
    const pendientes = mensajesPendientes(
      [
        mensaje("m1", "2026-10-30T09:00:00.000Z"),
        mensaje("m2", "2026-10-30T10:00:00.000Z"),
        mensaje("m3", "2026-10-30T11:00:00.000Z"),
        { ...mensaje("m4", "2026-10-30T12:00:00.000Z"), tipo: "suceso", contenido: null },
        mensaje("m5", "2026-10-30T12:30:00.000Z", "   "),
      ],
      resumen,
    );

    expect(pendientes.map((m) => m._id)).toEqual(["m3"]);
  });

  it("dispara el resumen al alcanzar el umbral configurado", () => {
    const pendientes = [mensaje("a", "2026-10-30T11:00:00.000Z")];

    expect(debeResumir(pendientes, 1)).toBe(true);
    expect(debeResumir(pendientes, 20)).toBe(false);
  });

  it("arma el prompt con el resumen anterior y los mensajes nuevos", () => {
    const prompt = armarPromptResumen("Acuerdo previo", [
      mensaje("m3", "2026-10-30T11:00:00.000Z", "Nueva propuesta"),
    ]);

    expect(prompt[0].role).toBe("system");
    expect(prompt[1].content).toContain("Acuerdo previo");
    expect(prompt[1].content).toContain("Ana: Nueva propuesta");
  });

  it("persiste el resumen generado y reporta actualizado", async () => {
    const pendientes = Array.from({ length: 20 }, (_, i) =>
      mensaje(`m${i + 3}`, `2026-10-30T11:00:${String(i).padStart(2, "0")}.000Z`),
    );

    const resultado = await quizasResumirSala({
      proyectoId: 7,
      mensajes: pendientes,
      resumen,
    });

    expect(resultado.actualizado).toBe(true);
    expect(mocks.actualizarResumen).toHaveBeenCalledWith(7, {
      texto: "Resumen nuevo",
      hastaMensajeId: "m22",
      modelo: expect.any(String),
    });
  });

  it("no llama al modelo si no se alcanzó el umbral", async () => {
    const resultado = await quizasResumirSala({
      proyectoId: 7,
      mensajes: [mensaje("m3", "2026-10-30T11:00:00.000Z")],
      resumen,
    });

    expect(resultado).toMatchObject({ actualizado: false, motivo: "umbral" });
    expect(mocks.chatConFallback).not.toHaveBeenCalled();
  });

  it("un fallo del modelo no propaga la excepción", async () => {
    mocks.chatConFallback.mockRejectedValue(new Error("sin cuota"));
    const pendientes = Array.from({ length: 20 }, (_, i) =>
      mensaje(`m${i}`, `2026-10-30T11:00:${String(i).padStart(2, "0")}.000Z`),
    );

    const resultado = await quizasResumirSala({ proyectoId: 7, mensajes: pendientes, resumen });

    expect(resultado.actualizado).toBe(false);
    expect(resultado.motivo).toContain("sin cuota");
  });
});
