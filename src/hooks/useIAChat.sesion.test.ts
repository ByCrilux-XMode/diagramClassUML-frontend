import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorProxy } from "@/lib/ia/proxy";
import { useIAChat } from "./useIAChat";

const mocks = vi.hoisted(() => ({
  reclamarTurno: vi.fn(),
  cerrarTurno: vi.fn(),
  cargarFuentes: vi.fn(),
}));

vi.mock("@/lib/turnos/api", () => ({
  ErrorTurno: class ErrorTurno extends Error {},
  reclamarTurno: mocks.reclamarTurno,
  cerrarTurno: mocks.cerrarTurno,
}));

vi.mock("@/lib/ia/context/cargar", () => ({
  cargarFuentes: mocks.cargarFuentes,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reclamarTurno.mockResolvedValue({ turno: { _id: "turno-1" } });
  mocks.cerrarTurno.mockResolvedValue({});
  useIAChat.setState({
    proyectoActivoId: "7",
    usuario: { usuarioId: 1, nombre: "Ana", puedeEditar: true },
    modo: "plan",
    pensando: false,
    error: null,
    mensajes: [],
    trace: [],
  });
});

describe("fallos de sesión en responderEnChat", () => {
  it("una sesión vencida no se muestra como 'el asistente no respondió'", async () => {
    mocks.cargarFuentes.mockRejectedValue(new ErrorProxy("sesion", "401", 401));

    await useIAChat.getState().responderEnChat({
      proyectoId: "7",
      prompt: "¿qué clases hay?",
      puedeEditar: true,
      mensajeId: "mensaje-1",
    });

    const estado = useIAChat.getState();
    expect(estado.error).toBe(
      "Tu sesión venció. Vuelve a iniciar sesión para usar el asistente.",
    );
    expect(estado.error).not.toContain("El asistente no respondió");
    expect(estado.pensando).toBe(false);
    expect(mocks.cerrarTurno).toHaveBeenCalledWith(
      "7",
      "turno-1",
      expect.objectContaining({ estado: "error" }),
    );
  });

  it("un backend de autenticación caído muestra el aviso de servicio", async () => {
    mocks.cargarFuentes.mockRejectedValue(new ErrorProxy("servicio", "503", 503));

    await useIAChat.getState().responderEnChat({
      proyectoId: "7",
      prompt: "¿qué clases hay?",
      puedeEditar: true,
      mensajeId: "mensaje-2",
    });

    expect(useIAChat.getState().error).toBe(
      "El servicio de autenticación no está disponible. Inténtalo de nuevo en unos segundos.",
    );
  });
});
