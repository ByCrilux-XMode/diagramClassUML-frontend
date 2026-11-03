import { describe, expect, it, vi } from "vitest";
import { ClienteActividad } from "./cliente";
import type { EventoActividad } from "./cliente";

const evento: EventoActividad = {
  sesionId: "ses-1",
  secuencia: 1,
  actorTipo: "humano",
  actorNombre: "Ana",
  tipo: "clase.crear",
  entidades: ["pedido"],
  cambios: [{ accion: "crear", entidadTipo: "clase", entidadKey: "pedido" }],
  resumen: "Ana creó la clase Pedido",
};

/**
 * Regresión: `ClienteActividad` llamaba a `this.fetchImpl(...)`. Si `fetchImpl`
 * era el `fetch` global, el receptor quedaba siendo la instancia y el navegador
 * lanzaba `TypeError: Illegal invocation`. El error se silenciaba y la cola se
 * reintentaba para siempre, así que la bitácora nunca llegaba a MongoDB.
 */
describe("ClienteActividad", () => {
  it("invoca fetch sin la instancia como receptor", async () => {
    let receptor: unknown;
    const fetchImpl = function (this: unknown): Promise<Response> {
      receptor = this;
      return Promise.resolve({ ok: true, status: 201 } as Response);
    };

    const cliente = new ClienteActividad({
      proyectoId: 7,
      baseUrl: "http://localhost:3000",
      fetchImpl: fetchImpl as typeof fetch,
    });
    cliente.encolar(evento);
    await cliente.vaciar(false);
    cliente.detener();

    expect(receptor).not.toBe(cliente);
    expect(receptor).toBe(globalThis);
  });

  it("envía el lote y vacía la cola cuando el servidor acepta", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 201 }) as Response);
    const cliente = new ClienteActividad({
      proyectoId: 7,
      baseUrl: "http://localhost:3000/",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    cliente.encolar(evento);
    expect(cliente.pendientes).toBe(1);

    await cliente.vaciar(false);
    cliente.detener();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(cliente.pendientes).toBe(0);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://localhost:3000/proyectos/7/eventos");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({ eventos: [evento] });
  });
});
