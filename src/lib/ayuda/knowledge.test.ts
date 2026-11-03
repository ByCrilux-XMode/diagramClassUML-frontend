import { describe, expect, it } from "vitest";
import { detectQuickIntent } from "./knowledge";

const proyectos = [{ proyectoId: 1, nombre: "veterinaria" }];

describe("detectQuickIntent", () => {
  it("crea el proyecto cuando se indica el nombre", () => {
    expect(detectQuickIntent("crea un proyecto llamado clinica", [])).toEqual({
      intent: "crear_proyecto",
      nombre: "clinica",
    });
  });

  it("sin nombre abre el modal de creación", () => {
    expect(detectQuickIntent("crea un proyecto", [])).toEqual({ intent: "open_create_modal" });
  });

  it("detecta a quién invitar y con qué rol", () => {
    expect(detectQuickIntent("invita a user2 como editor en veterinaria", proyectos)).toEqual({
      intent: "invitar_colaborador",
      username: "user2",
      rol: "EDITOR",
      projectId: 1,
      projectName: "veterinaria",
    });
  });

  it("deja el proyecto sin resolver si no se menciona", () => {
    expect(detectQuickIntent("añade a user3 como lector", proyectos)).toEqual({
      intent: "invitar_colaborador",
      username: "user3",
      rol: "LECTOR",
      projectId: undefined,
      projectName: undefined,
    });
  });

  it("no intercepta preguntas de cómo hacerlo", () => {
    expect(detectQuickIntent("como creo un proyecto", proyectos)).toBeNull();
    expect(detectQuickIntent("como invito a un colaborador", proyectos)).toBeNull();
  });
});
