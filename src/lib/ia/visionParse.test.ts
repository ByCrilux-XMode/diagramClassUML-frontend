import { describe, expect, it } from "vitest";
import { cerrarJsonTruncado, parseVisionJson } from "./visionParse";

/** Forma mínima que devuelve el modelo de visión. */
interface Esquema {
  tables: Array<{
    name: string;
    columns?: Array<{ name: string; type?: string }>;
  }>;
}

describe("parseVisionJson", () => {
  it("recupera un JSON truncado a mitad de objeto (tope de tokens)", () => {
    const truncado =
      '{"tables":[{"name":"Alumno","columns":[{"name":"id","type":"int"},{"name":"nombre","type":"varchar';

    const parsed = parseVisionJson(truncado) as Esquema;

    expect(parsed.tables).toHaveLength(1);
    expect(parsed.tables[0].name).toBe("Alumno");
    expect(parsed.tables[0].columns).toEqual([
      { name: "id", type: "int" },
      { name: "nombre", type: "varchar" },
    ]);
  });

  it("acepta bloques ```json con comas finales", () => {
    const contenido =
      '```json\n{"tables":[{"name":"Curso","columns":[{"name":"id","type":"int"},],},],}\n```';

    const parsed = parseVisionJson(contenido) as Esquema;

    expect(parsed.tables[0].name).toBe("Curso");
    expect(parsed.tables[0].columns).toEqual([{ name: "id", type: "int" }]);
  });

  it("ignora texto antes y después del objeto", () => {
    const contenido = 'Acá está el esquema:\n{"tables":[{"name":"Materia"}]}\nSaludos.';

    expect(parseVisionJson(contenido)).toEqual({ tables: [{ name: "Materia" }] });
  });

  it("devuelve null con respuesta vacía o sin JSON", () => {
    expect(parseVisionJson("")).toBeNull();
    expect(parseVisionJson("   ")).toBeNull();
    expect(parseVisionJson("No pude leer la imagen.")).toBeNull();
  });
});

describe("cerrarJsonTruncado", () => {
  it("cierra la cadena y las estructuras pendientes", () => {
    expect(cerrarJsonTruncado('{"tables":[{"name":"Alu')).toBe('{"tables":[{"name":"Alu"}]}');
  });

  it("descarta una coma final antes de cerrar", () => {
    expect(cerrarJsonTruncado('{"tables":[{"name":"Alu"},')).toBe('{"tables":[{"name":"Alu"}]}');
  });

  it("devuelve null si no hay objeto", () => {
    expect(cerrarJsonTruncado("texto sin llaves")).toBeNull();
  });
});
