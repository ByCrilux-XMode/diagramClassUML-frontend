import { describe, expect, it } from "vitest";
import { insertarMencion, mencionaIA } from "./mencion";

describe("mencionaIA", () => {
  it("detecta la mención como palabra completa", () => {
    expect(mencionaIA("@ia crea la clase Pedido")).toBe(true);
    expect(mencionaIA("oye @ia, agrega el atributo")).toBe(true);
    expect(mencionaIA("termina con @ia")).toBe(true);
    expect(mencionaIA("@IA mayúsculas")).toBe(true);
  });

  it("ignora nombres que empiezan por ia", () => {
    expect(mencionaIA("@ian revisa esto")).toBe(false);
    expect(mencionaIA("@iara")).toBe(false);
  });

  it("ignora correos y texto pegado", () => {
    expect(mencionaIA("escribe a ana@ia.com")).toBe(false);
    expect(mencionaIA("hola@ia")).toBe(false);
    expect(mencionaIA("algo@ia_extra")).toBe(false);
  });

  it("cuenta una sola invocación aunque haya varias menciones", () => {
    const texto = "@ia y otra vez @ia por favor";
    const invocaciones = texto.match(/@ia/gu)?.length ?? 0;

    expect(mencionaIA(texto)).toBe(true);
    expect(invocaciones).toBe(2);
    // La invocación es por mensaje, no por mención: el detector devuelve un
    // booleano, así que dos menciones producen el mismo resultado que una.
    expect(mencionaIA("@ia")).toBe(mencionaIA("@ia @ia"));
  });
});

describe("insertarMencion", () => {
  it("inserta la mención en la posición del cursor", () => {
    const resultado = insertarMencion("crea la clase", 6);

    // El cursor cae dentro de una palabra, así que se añade un separador para
    // que la mención quede como palabra completa.
    expect(resultado.texto).toBe("crea l @ia a clase");
    expect(resultado.cursor).toBe(6 + " @ia ".length);
  });

  it("no duplica la mención si ya existe", () => {
    const texto = "@ia crea la clase";
    const resultado = insertarMencion(texto, 3);

    expect(resultado.texto).toBe(texto);
    expect(resultado.cursor).toBe(3);
  });

  it("añade un separador cuando el cursor está pegado a una palabra", () => {
    const resultado = insertarMencion("hola", 4);

    expect(resultado.texto).toBe("hola @ia ");
  });
});
