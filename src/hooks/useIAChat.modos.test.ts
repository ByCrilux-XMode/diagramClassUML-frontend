import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useIAChat } from "./useIAChat";
import type { ChatEntry } from "./useIAChat";

/** Entorno `node`: se sustituye `window` por un localStorage en memoria. */
function instalarNavegador() {
  const almacenamiento = new Map<string, string>();
  const localStorage = {
    getItem: (clave: string) => almacenamiento.get(clave) ?? null,
    setItem: (clave: string, valor: string) => void almacenamiento.set(clave, valor),
    removeItem: (clave: string) => void almacenamiento.delete(clave),
  };
  (globalThis as { window?: unknown }).window = { localStorage };
  return almacenamiento;
}

function abrirProyecto(proyectoId: string, usuarioId: number, nombre = "Ana") {
  useIAChat.getState().setContextoUsuario({ usuarioId, nombre, puedeEditar: true });
  useIAChat.getState().setProyectoActivo(proyectoId);
}

const estadoInicial = () => ({
  modo: "plan" as const,
  ambito: "grupo" as const,
  mensajes: [] as ChatEntry[],
  proyectoActivoId: null as string | null,
  usuario: { usuarioId: null as number | null, nombre: "Usuario", puedeEditar: false },
  ultimoPlan: null as string | null,
});

describe("preferencias locales de modo y ámbito", () => {
  beforeEach(() => {
    instalarNavegador();
    useIAChat.setState(estadoInicial());
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
    useIAChat.setState(estadoInicial());
  });

  it("arranca en plan y en grupo", () => {
    abrirProyecto("7", 3);
    expect(useIAChat.getState().modo).toBe("plan");
    expect(useIAChat.getState().ambito).toBe("grupo");
  });

  it("setModo guarda la preferencia por proyecto y persona", () => {
    abrirProyecto("7", 3);
    useIAChat.getState().setModo("build");

    expect(window.localStorage.getItem("ia.modo:7:3")).toBe("build");
    expect(useIAChat.getState().modo).toBe("build");
  });

  it("recupera el modo guardado al volver a abrir el proyecto", () => {
    window.localStorage.setItem("ia.modo:7:3", "build");
    window.localStorage.setItem("ia.ambito:7:3", "privado");

    useIAChat.setState(estadoInicial());
    abrirProyecto("7", 3);

    expect(useIAChat.getState().modo).toBe("build");
    expect(useIAChat.getState().ambito).toBe("privado");
  });

  it("no arrastra el modo a otra persona del mismo equipo", () => {
    window.localStorage.setItem("ia.modo:7:3", "build");
    useIAChat.setState(estadoInicial());

    useIAChat.getState().setContextoUsuario({ usuarioId: 9, nombre: "Luis", puedeEditar: true });
    useIAChat.getState().setProyectoActivo("7");

    expect(useIAChat.getState().modo).toBe("plan");
  });

  it("no arrastra el modo a otro proyecto", () => {
    window.localStorage.setItem("ia.modo:7:3", "build");
    useIAChat.setState(estadoInicial());
    abrirProyecto("7", 3);
    expect(useIAChat.getState().modo).toBe("build");

    useIAChat.getState().setProyectoActivo("8");
    expect(useIAChat.getState().modo).toBe("plan");
  });

  it("rechaza valores que no son modos válidos", () => {
    window.localStorage.setItem("ia.modo:7:3", "destruir-todo");
    useIAChat.setState(estadoInicial());
    abrirProyecto("7", 3);
    expect(useIAChat.getState().modo).toBe("plan");
  });

  it("restaura el chat privado guardado al reabrir el proyecto", () => {
    const entradas: ChatEntry[] = [
      { id: "m1", role: "user", content: "¿qué relaciones tiene Pedido?", trace: [] },
      { id: "m2", role: "assistant", content: "Tiene dos.", trace: [] },
    ];
    window.localStorage.setItem("ia.privado:7:3", JSON.stringify(entradas));

    useIAChat.setState(estadoInicial());
    abrirProyecto("7", 3);

    expect(useIAChat.getState().mensajes.map((m) => m.content)).toEqual([
      "¿qué relaciones tiene Pedido?",
      "Tiene dos.",
    ]);
  });

  it("el privado de una persona no aparece en la de otra", () => {
    window.localStorage.setItem(
      "ia.privado:7:3",
      JSON.stringify([{ id: "m1", role: "user", content: "secreto", trace: [] }]),
    );
    useIAChat.setState(estadoInicial());

    useIAChat.getState().setContextoUsuario({ usuarioId: 9, nombre: "Luis", puedeEditar: true });
    useIAChat.getState().setProyectoActivo("7");

    expect(useIAChat.getState().mensajes).toEqual([]);
  });
});
