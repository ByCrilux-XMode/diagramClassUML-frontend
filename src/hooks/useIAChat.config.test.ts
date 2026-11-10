import { beforeEach, describe, expect, it, vi } from "vitest";
import { useIAChat } from "./useIAChat";
import type { ConfigIaApi } from "@/lib/config-ia/api";

const mocks = vi.hoisted(() => ({
  obtenerConfigIa: vi.fn(),
  actualizarConfigIa: vi.fn(),
  sonda: vi.fn(),
  leerCache: vi.fn(),
}));

vi.mock("@/lib/config-ia/api", () => ({
  obtenerConfigIa: mocks.obtenerConfigIa,
  actualizarConfigIa: mocks.actualizarConfigIa,
}));
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

describe("selección compartida del proyecto (config_ia)", () => {
  beforeEach(() => {
    useIAChat.setState({
      proveedor: "openrouter",
      modelo: "",
      modeloPrivado: "",
      ambito: "grupo",
      error: null,
      avisoConfig: null,
      usuario: { usuarioId: 1, nombre: "Ana", puedeEditar: true, rol: null },
    });
  });

  it("aplica la selección que fijó el creador al cargar la config", async () => {
    mocks.obtenerConfigIa.mockResolvedValue({
      ...config,
      porDefecto: false,
      proveedor: "hf-space",
      modelo: "CHRISTS20/qwn-uml-lora-7b-v2",
    });

    await useIAChat.getState().cargarConfigIa("7");

    expect(useIAChat.getState().proveedor).toBe("hf-space");
    expect(useIAChat.getState().modelo).toBe("CHRISTS20/qwn-uml-lora-7b-v2");
  });

  it("no pisa la selección cuando el proyecto no tiene config propia", async () => {
    useIAChat.setState({ proveedor: "openrouter", modelo: "modelo/mio" });
    mocks.obtenerConfigIa.mockResolvedValue(config); // porDefecto: true

    await useIAChat.getState().cargarConfigIa("7");

    expect(useIAChat.getState().proveedor).toBe("openrouter");
    expect(useIAChat.getState().modelo).toBe("modelo/mio");
  });

  it("el CREADOR guarda la selección en config_ia", async () => {
    useIAChat.setState({
      usuario: { usuarioId: 1, nombre: "Ana", puedeEditar: true, rol: "CREADOR" },
    });

    useIAChat.getState().setModelo("openrouter/modelo-x");

    await vi.waitFor(() =>
      expect(mocks.actualizarConfigIa).toHaveBeenCalledWith("7", {
        proveedor: "openrouter",
        modelo: "openrouter/modelo-x",
      }),
    );
  });

  it("un colaborador no guarda nada en config_ia", () => {
    useIAChat.setState({
      usuario: { usuarioId: 2, nombre: "Luis", puedeEditar: true, rol: "EDITOR" },
    });

    useIAChat.getState().setModelo("openrouter/modelo-x");

    expect(mocks.actualizarConfigIa).not.toHaveBeenCalled();
  });

  it("el ámbito privado siempre sondea HF Space con el modelo local", async () => {
    useIAChat.setState({ ambito: "privado", modeloPrivado: "Qwen/Qwen2.5-Coder-7B-Instruct" });

    await useIAChat.getState().probarConformidad();

    expect(mocks.sonda).toHaveBeenCalledWith({
      proveedor: "hf-space",
      modelo: "Qwen/Qwen2.5-Coder-7B-Instruct",
      forzar: undefined,
    });
  });
});
