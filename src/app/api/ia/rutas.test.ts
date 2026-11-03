import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { limpiarCacheSesion } from "@/lib/ia/sesion";
import { reiniciarLimites } from "@/lib/ia/limite";
import { POST as chatPOST } from "./chat/route";
import { POST as helpPOST } from "./help/route";
import { GET as healthGET } from "./health/route";
import { GET as modelsGET } from "./models/route";

const adapters = vi.hoisted(() => ({
  chat: vi.fn(),
  listModels: vi.fn(),
  health: vi.fn(),
}));

vi.mock("@/lib/ia/adapters", () => ({
  getAdapter: () => adapters,
  isValidProvider: (valor: unknown) =>
    ["ollama", "hf-space", "huggingface", "openrouter"].includes(String(valor)),
}));

function pedido(opciones: {
  token?: string;
  body?: unknown;
  search?: string;
} = {}): NextRequest {
  const url = new URL(`http://localhost/api/ia/ruta${opciones.search ?? ""}`);
  return {
    cookies: {
      get: (nombre: string) =>
        nombre === "tokenAcceso" && opciones.token
          ? { name: nombre, value: opciones.token }
          : undefined,
    },
    json: async () => opciones.body,
    nextUrl: { searchParams: url.searchParams },
    url: url.toString(),
  } as unknown as NextRequest;
}

function sesionValida() {
  return {
    status: 200,
    ok: true,
    json: async () => ({
      usuarioId: 1,
      username: "ana",
      persona: { personaId: 1, nombre: "Ana", apellido: "Pérez" },
    }),
  } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  limpiarCacheSesion();
  reiniciarLimites();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  adapters.chat.mockResolvedValue({ content: "ok", toolCalls: [] });
  adapters.listModels.mockResolvedValue(["modelo/x"]);
  adapters.health.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("rutas /api/ia sin sesión", () => {
  it("chat responde 401 antes de leer el cuerpo y sin llamar al proveedor", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const respuesta = await chatPOST(
      pedido({
        body: {
          provider: "openrouter",
          model: "modelo/x",
          messages: [{ role: "user", content: "hola" }],
        },
      }),
    );

    expect(respuesta.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(adapters.chat).not.toHaveBeenCalled();
  });

  it("help responde 401", async () => {
    const respuesta = await helpPOST(pedido({ body: { messages: [] } }));
    expect(respuesta.status).toBe(401);
  });

  it("models y health responden 401 y no consultan al proveedor", async () => {
    expect((await modelsGET(pedido())).status).toBe(401);
    expect((await healthGET(pedido())).status).toBe(401);
    expect(adapters.listModels).not.toHaveBeenCalled();
    expect(adapters.health).not.toHaveBeenCalled();
  });
});

describe("rutas /api/ia con sesión válida", () => {
  it("chat propaga el usuario y continúa al adaptador", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sesionValida()));

    const respuesta = await chatPOST(
      pedido({
        token: "token-valido",
        body: {
          provider: "openrouter",
          model: "modelo/x",
          messages: [{ role: "user", content: "hola" }],
        },
      }),
    );

    expect(respuesta.status).toBe(200);
    expect(adapters.chat).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "openrouter", model: "modelo/x" }),
    );
  });

  it("models y health devuelven datos con la sesión resuelta", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sesionValida()));

    const modelos = await modelsGET(
      pedido({ token: "token-valido", search: "?provider=openrouter" }),
    );
    const salud = await healthGET(
      pedido({ token: "token-valido", search: "?provider=openrouter" }),
    );

    expect(modelos.status).toBe(200);
    expect(await modelos.json()).toEqual({ provider: "openrouter", models: ["modelo/x"] });
    expect(salud.status).toBe(200);
    expect(adapters.listModels).toHaveBeenCalled();
    expect(adapters.health).toHaveBeenCalled();
  });
});
