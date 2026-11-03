import { beforeEach, describe, expect, it } from "vitest";
import { consumirLimite, reiniciarLimites, respuestaLimite, tamanoLimites } from "./limite";

beforeEach(() => {
  reiniciarLimites();
});

describe("consumirLimite", () => {
  it("permite una ráfaga hasta la capacidad del minuto y luego rechaza", () => {
    const opciones = { porMinuto: 3, porHora: 100, ahora: 0 };

    expect(consumirLimite("usuario-1", opciones)).toMatchObject({ permitido: true, restantes: 2 });
    expect(consumirLimite("usuario-1", opciones)).toMatchObject({ permitido: true, restantes: 1 });
    expect(consumirLimite("usuario-1", opciones)).toMatchObject({ permitido: true, restantes: 0 });

    const rechazo = consumirLimite("usuario-1", opciones);
    expect(rechazo.permitido).toBe(false);
    expect(rechazo.motivo).toBe("minuto");
    expect(rechazo.retryAfterSegundos).toBe(20);
  });

  it("recarga con el tiempo y vuelve a aceptar", () => {
    consumirLimite("usuario-1", { porMinuto: 2, porHora: 100, ahora: 0 });
    consumirLimite("usuario-1", { porMinuto: 2, porHora: 100, ahora: 0 });
    expect(
      consumirLimite("usuario-1", { porMinuto: 2, porHora: 100, ahora: 0 }).permitido,
    ).toBe(false);

    expect(
      consumirLimite("usuario-1", { porMinuto: 2, porHora: 100, ahora: 30_000 }),
    ).toMatchObject({ permitido: true, restantes: 0 });
  });

  it("la ventana de la hora frena aunque el minuto tenga cupo", () => {
    const opciones = { porMinuto: 100, porHora: 2, ahora: 0 };
    consumirLimite("usuario-1", opciones);
    consumirLimite("usuario-1", opciones);

    const rechazo = consumirLimite("usuario-1", opciones);
    expect(rechazo).toMatchObject({ permitido: false, motivo: "hora", retryAfterSegundos: 1800 });

    expect(
      consumirLimite("usuario-1", { porMinuto: 100, porHora: 2, ahora: 1_800_000 }),
    ).toMatchObject({ permitido: true });
  });

  it("aísla el cupo entre usuarios", () => {
    const opciones = { porMinuto: 1, porHora: 10, ahora: 0 };
    expect(consumirLimite("ana", opciones).permitido).toBe(true);
    expect(consumirLimite("ana", opciones).permitido).toBe(false);
    expect(consumirLimite("luis", opciones).permitido).toBe(true);
    expect(tamanoLimites()).toBe(2);
  });

  it("un rechazo no consume fichas de la ventana que sí tenía cupo", () => {
    const opciones = { porMinuto: 1, porHora: 2, ahora: 0 };
    consumirLimite("usuario-1", opciones);
    expect(consumirLimite("usuario-1", opciones)).toMatchObject({
      permitido: false,
      motivo: "minuto",
    });

    // Si el rechazo hubiera gastado la ficha de la hora, a los 60 s seguiría
    // bloqueado (la hora solo recupera 1/60 de ficha); sin gastarla, pasa.
    expect(
      consumirLimite("usuario-1", { porMinuto: 1, porHora: 2, ahora: 60_000 }),
    ).toMatchObject({ permitido: true });
  });

  it("cero desactiva el límite", () => {
    for (let i = 0; i < 50; i++) {
      expect(
        consumirLimite("usuario-1", { porMinuto: 0, porHora: 0, ahora: 0 }).permitido,
      ).toBe(true);
    }
  });

  it("la recarga no supera la capacidad", () => {
    consumirLimite("usuario-1", { porMinuto: 2, porHora: 100, ahora: 0 });
    consumirLimite("usuario-1", { porMinuto: 2, porHora: 100, ahora: 0 });

    expect(
      consumirLimite("usuario-1", { porMinuto: 2, porHora: 100, ahora: 60 * 60_000 }),
    ).toMatchObject({ permitido: true, restantes: 1 });
  });
});

describe("respuestaLimite", () => {
  it("devuelve 429 con Retry-After en segundos", async () => {
    const respuesta = respuestaLimite({
      permitido: false,
      retryAfterSegundos: 42,
      restantes: 0,
      motivo: "minuto",
    });

    expect(respuesta.status).toBe(429);
    expect(respuesta.headers.get("Retry-After")).toBe("42");
    const cuerpo = (await respuesta.json()) as { error: string };
    expect(cuerpo.error).toContain("límite");
  });
});
