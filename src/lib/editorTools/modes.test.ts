import { describe, expect, it } from "vitest";
import { READ_ONLY_TOOL_NAMES, TOOLS } from "./tools";
import { esEditable, modoEfectivo, toolsForMode } from "./modes";

const nombres = (contexto: Parameters<typeof toolsForMode>[0]) =>
  toolsForMode(contexto).map((tool) => tool.function.name);

const SOLO_LECTURA = TOOLS.filter((tool) => READ_ONLY_TOOL_NAMES.has(tool.name)).map((t) => t.name);

describe("esEditable", () => {
  it("solo grupo + build + rol de edición habilita ediciones", () => {
    expect(esEditable({ ambito: "grupo", modo: "build", rol: "EDITOR" })).toBe(true);
    expect(esEditable({ ambito: "grupo", modo: "build", rol: "CREADOR" })).toBe(true);
  });

  it("plan nunca edita, en ningún rol", () => {
    expect(esEditable({ ambito: "grupo", modo: "plan", rol: "CREADOR" })).toBe(false);
    expect(esEditable({ ambito: "grupo", modo: "plan", rol: "EDITOR" })).toBe(false);
  });

  it("LECTOR nunca edita, ni en build", () => {
    expect(esEditable({ ambito: "grupo", modo: "build", rol: "LECTOR" })).toBe(false);
    expect(esEditable({ ambito: "grupo", modo: "build", rol: null })).toBe(false);
  });

  it("el ámbito privado nunca edita, aunque el modo guardado sea build", () => {
    expect(esEditable({ ambito: "privado", modo: "build", rol: "CREADOR" })).toBe(false);
  });
});

describe("modoEfectivo", () => {
  it("en privado fuerza plan", () => {
    expect(modoEfectivo({ ambito: "privado", modo: "build" })).toBe("plan");
  });

  it("en grupo conserva el modo", () => {
    expect(modoEfectivo({ ambito: "grupo", modo: "build" })).toBe("build");
    expect(modoEfectivo({ ambito: "grupo", modo: "plan" })).toBe("plan");
  });
});

describe("toolsForMode", () => {
  it("grupo + build + EDITOR recibe todas las herramientas", () => {
    const set = nombres({ ambito: "grupo", modo: "build", rol: "EDITOR" });
    expect(set).toHaveLength(TOOLS.length);
    expect(set).toContain("addClass");
    expect(set).toContain("removeClass");
    expect(set).toContain("connect");
  });

  it("grupo + plan recibe solo lectura", () => {
    const set = nombres({ ambito: "grupo", modo: "plan", rol: "CREADOR" });
    expect(set).toEqual(SOLO_LECTURA);
    expect(set).not.toContain("addClass");
  });

  it("grupo + build + LECTOR degrada a solo lectura", () => {
    const set = nombres({ ambito: "grupo", modo: "build", rol: "LECTOR" });
    expect(set).toEqual(SOLO_LECTURA);
    for (const escritura of [
      "addClass",
      "removeClass",
      "updateClass",
      "connect",
      "updateRelation",
      "updateAttribute",
      "updateMethod",
      "replaceAll",
    ]) {
      expect(set).not.toContain(escritura);
    }
  });

  it("privado + build degrada a solo lectura", () => {
    const set = nombres({ ambito: "privado", modo: "build", rol: "CREADOR" });
    expect(set).toEqual(SOLO_LECTURA);
  });

  it("un LECTOR sigue pudiendo consultar el diagrama", () => {
    const set = nombres({ ambito: "grupo", modo: "build", rol: "LECTOR" });
    expect(set).toContain("getState");
    expect(set).toContain("validate");
  });

  it("todas las herramientas ofrecidas son de lectura cuando no hay edición", () => {
    const set = nombres({ ambito: "grupo", modo: "plan", rol: null });
    expect(set.every((name) => READ_ONLY_TOOL_NAMES.has(name))).toBe(true);
  });
});
