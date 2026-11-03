import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  COOKIE_SESION,
  ErrorSesion,
  SESION_MAX_ENTRADAS,
  SESION_TTL_MS,
  claveSesion,
  clavesCacheSesion,
  leerSesion,
  limpiarCacheSesion,
  respuestaErrorSesion,
} from "./sesion";

const usuario = {
  usuarioId: 7,
  username: "ana",
  persona: { personaId: 1, nombre: "Ana", apellido: "Pérez" },
};

function pedido(token?: string) {
  return {
    cookies: {
      get: (nombre: string) =>
        nombre === COOKIE_SESION && token ? { name: nombre, value: token } : undefined,
    },
  } as unknown as Pick<NextRequest, "cookies">;
}

function respuesta(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

function exito(body: unknown = usuario) {
  return vi.fn(async () => respuesta(200, body));
}

beforeEach(() => {
  limpiarCacheSesion();
  vi.restoreAllMocks();
});

describe("leerSesion", () => {
  it("resuelve usuarioId y nombre desde /usuarios/me", async () => {
    const fetchImpl = exito();

    const sesion = await leerSesion(pedido("token-abc"), { fetchImpl, ahora: 1_000 });

    expect(sesion).toEqual({ usuarioId: 7, nombre: "Ana Pérez" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/usuarios\/me$/);
    expect(init).toMatchObject({
      method: "GET",
      cache: "no-store",
      headers: expect.objectContaining({ cookie: `${COOKIE_SESION}=token-abc` }),
    });
  });

  it("sin cookie responde 401 sin llamar al backend", async () => {
    const fetchImpl = exito();

    await expect(leerSesion(pedido(), { fetchImpl })).rejects.toMatchObject({
      motivo: "sin-sesion",
      status: 401,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("un 401 del backend invalida la caché y devuelve 401", async () => {
    const primero = exito();
    await leerSesion(pedido("token-revocado"), { fetchImpl: primero, ahora: 1_000 });
    expect(clavesCacheSesion()).toHaveLength(1);

    const revocado = vi.fn(async () => respuesta(401, { message: "No autorizado" }));
    await expect(
      leerSesion(pedido("token-revocado"), {
        fetchImpl: revocado,
        ahora: 1_000 + SESION_TTL_MS + 1,
      }),
    ).rejects.toMatchObject({ motivo: "sesion-invalida", status: 401 });

    expect(clavesCacheSesion()).toHaveLength(0);
  });

  it("un timeout del backend responde 503 y conserva otras entradas", async () => {
    const fetchImpl = exito();
    await leerSesion(pedido("token-vivo"), { fetchImpl, ahora: 1_000 });

    const colgado = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    await expect(
      leerSesion(pedido("token-otro"), {
        fetchImpl: colgado as unknown as typeof fetch,
        ahora: 2_000,
        timeoutMs: 5,
      }),
    ).rejects.toMatchObject({ motivo: "servicio-no-disponible", status: 503 });

    expect(clavesCacheSesion()).toContain(claveSesion("token-vivo"));
  });

  it("un 503 del backend no borra la caché de otras sesiones", async () => {
    const fetchImpl = exito();
    await leerSesion(pedido("token-vivo"), { fetchImpl, ahora: 1_000 });

    const caido = vi.fn(async () => respuesta(503, { error: "mantenimiento" }));
    await expect(
      leerSesion(pedido("token-nuevo"), {
        fetchImpl: caido,
        ahora: 2_000,
      }),
    ).rejects.toMatchObject({ motivo: "servicio-no-disponible", status: 503 });

    expect(clavesCacheSesion()).toEqual([claveSesion("token-vivo")]);
  });

  it("una respuesta inválida se trata como servicio no disponible", async () => {
    const fetchImpl = exito({ username: "sin-id" });

    await expect(
      leerSesion(pedido("token-x"), { fetchImpl, ahora: 1_000 }),
    ).rejects.toMatchObject({ motivo: "servicio-no-disponible", status: 503 });
  });

  it("usa el username cuando no hay persona", async () => {
    const fetchImpl = exito({ usuarioId: 9, username: "luis" });

    const sesion = await leerSesion(pedido("token-luis"), { fetchImpl, ahora: 1_000 });

    expect(sesion).toEqual({ usuarioId: 9, nombre: "luis" });
  });
});

describe("caché de sesión", () => {
  it("no vuelve a consultar al backend dentro del TTL", async () => {
    const fetchImpl = exito();

    await leerSesion(pedido("token-cache"), { fetchImpl, ahora: 1_000 });
    await leerSesion(pedido("token-cache"), { fetchImpl, ahora: 1_000 + SESION_TTL_MS - 1 });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("vuelve a consultar al expirar el TTL", async () => {
    const fetchImpl = exito();

    await leerSesion(pedido("token-cache"), { fetchImpl, ahora: 1_000 });
    await leerSesion(pedido("token-cache"), { fetchImpl, ahora: 1_000 + SESION_TTL_MS });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("la clave es sha256 y no contiene el token en claro", async () => {
    const fetchImpl = exito();
    const token = "token-super-secreto";

    await leerSesion(pedido(token), { fetchImpl, ahora: 1_000 });

    const claves = clavesCacheSesion();
    expect(claves).toHaveLength(1);
    expect(claves[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(claves[0]).not.toContain(token);
    expect(claves[0]).toBe(claveSesion(token));
  });

  it("respeta el tope de entradas desalojando la más antigua", async () => {
    const fetchImpl = exito();

    for (let i = 0; i <= SESION_MAX_ENTRADAS; i++) {
      await leerSesion(pedido(`token-${i}`), { fetchImpl, ahora: 1_000 });
    }

    const claves = clavesCacheSesion();
    expect(claves).toHaveLength(SESION_MAX_ENTRADAS);
    expect(claves).not.toContain(claveSesion("token-0"));
    expect(claves).toContain(claveSesion(`token-${SESION_MAX_ENTRADAS}`));
  });
});

describe("respuestaErrorSesion", () => {
  it("traduce 401 y 503 sin filtrar el token", () => {
    const sinSesion = respuestaErrorSesion(new ErrorSesion("sin-sesion", "Inicia sesión."));
    expect(sinSesion.status).toBe(401);

    const caido = respuestaErrorSesion(
      new ErrorSesion("servicio-no-disponible", "Servicio caído."),
    );
    expect(caido.status).toBe(503);

    const inesperado = respuestaErrorSesion(new Error("boom token-123"));
    expect(inesperado.status).toBe(503);
  });
});
