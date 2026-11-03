import { beforeEach, describe, expect, it, vi } from "vitest";
import { useIAChat } from "./useIAChat";
import type { ConfigIaApi } from "@/lib/config-ia/api";

const mocks = vi.hoisted(() => ({
  obtenerConfigIa: vi.fn(),
  sonda: vi.fn(),
  leerCache: vi.fn(),
}));

vi.mock("@/lib/config-ia/api", () => ({ obtenerConfigIa: mocks.obtenerConfigIa }));
vi.mock("@/lib/ia/conformidad", () => ({
  probarConformidad: mocks.sonda,
  leerConformidadCache: mocks.leerCache,
}));

const config: ConfigIaApi = {
  proyectoId: 7,
  proveedor: "openrouter",
  modelo: null,
  cadenas: {
    edicion: [{ proveedor: "openrouter", modelo: null }, { proveedor: "hf-space", modelo: null }],
    consulta: [{ proveedor: "hf-space", modelo: null }],
    resumen: [{ proveedor: "hf-space", modelo: null }],
  },
  actualizadoPor: null,
  actualizadoEn: null,
  porDefecto: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  useIAChat.setState({
    proyectoActivoId: "7",
    configIa: null,
    conformidad: null,
    probandoConformidad: false,
  });
});

describe("config_ia en el store", () => {
  it("carga la configuración del proyecto abierto", async () => {
    mocks.obtenerConfigIa.mockResolvedValue(config);

    await useIAChat.getState().cargarConfigIa("7");

    expect(mocks.obtenerConfigIa).toHaveBeenCalledWith("7");
    expect(useIAChat.getState().configIa).toEqual(config);
  });

  it("si la red falla, degrada a los defaults sin lanzar", async () => {
    mocks.obtenerConfigIa.mockRejectedValue(new Error("sin conexión"));

    await expect(useIAChat.getState().cargarConfigIa("7")).resolves.toBeUndefined();
    expect(useIAChat.getState().configIa).toBeNull();
  });

  it("descarta una respuesta tardía de otro proyecto", async () => {
    let resolver: (valor: ConfigIaApi) => void = () => undefined;
    mocks.obtenerConfigIa.mockReturnValue(
      new Promise<ConfigIaApi>((resolve) => {
        resolver = resolve;
      }),
    );

    const carga = useIAChat.getState().cargarConfigIa("7");
    useIAChat.setState({ proyectoActivoId: "8" });
    resolver(config);

    await carga;
    expect(useIAChat.getState().configIa).toBeNull();
  });
});

describe("conformidad en el store", () => {
  it("guarda el resultado de la sonda", async () => {
    const resultado = {
      estado: "verde" as const,
      proveedor: "openrouter" as const,
      modelo: "modelo/x",
      detalle: "tool_calls nativos",
      probadoEn: new Date().toISOString(),
    };
    mocks.sonda.mockResolvedValue(resultado);

    await useIAChat.getState().probarConformidad("openrouter", "modelo/x");

    expect(mocks.sonda).toHaveBeenCalledWith({
      proveedor: "openrouter",
      modelo: "modelo/x",
      forzar: undefined,
    });
    expect(useIAChat.getState().conformidad).toEqual(resultado);
    expect(useIAChat.getState().probandoConformidad).toBe(false);
  });

  it("sin modelo no llama a la sonda y explica el motivo", async () => {
    await useIAChat.getState().probarConformidad("openrouter", "  ");

    expect(mocks.sonda).not.toHaveBeenCalled();
    expect(useIAChat.getState().error).toContain("modelo");
  });
});
