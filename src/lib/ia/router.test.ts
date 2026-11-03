import { describe, expect, it } from "vitest";
import {
  ErrorCadena,
  formatearAvisoFallback,
  modeloDeTramo,
  parsearCadena,
  resolverCadena,
} from "./router";

describe("parsearCadena", () => {
  it("parsea proveedor y modelo separados por dos puntos", () => {
    expect(parsearCadena("openrouter:modelo/x,hf-space")).toEqual([
      { proveedor: "openrouter", modelo: "modelo/x" },
      { proveedor: "hf-space", modelo: null },
    ]);
  });

  it("una cadena vacía no produce tramos", () => {
    expect(parsearCadena("   ")).toEqual([]);
  });

  it("rechaza Ollama con un error de configuración legible", () => {
    expect(() => parsearCadena("ollama:qwen2.5-coder:7b")).toThrow(ErrorCadena);
    expect(() => parsearCadena("ollama:qwen2.5-coder:7b")).toThrow(/Ollama no forma parte/);
  });

  it("rechaza proveedores desconocidos y tramos vacíos", () => {
    expect(() => parsearCadena("anthropic:modelo")).toThrow(/Proveedor no permitido/);
    expect(() => parsearCadena("openrouter,,hf-space")).toThrow(/tramo vacío/);
  });
});

describe("resolverCadena", () => {
  it("usa la cadena del proyecto cuando existe", () => {
    expect(
      resolverCadena({
        tarea: "edicion",
        config: { cadenas: { edicion: [{ proveedor: "hf-space", modelo: null }] } },
      }),
    ).toEqual([{ proveedor: "hf-space", modelo: null }]);
  });

  it("los defaults de D55 ordenan cada tarea", () => {
    expect(resolverCadena({ tarea: "edicion" })[0]?.proveedor).toBe("openrouter");
    expect(resolverCadena({ tarea: "consulta" })[0]?.proveedor).toBe("hf-space");
    expect(resolverCadena({ tarea: "resumen" })[0]?.proveedor).toBe("hf-space");
  });

  it("el pin de la persona va primero y no se repite", () => {
    expect(
      resolverCadena({
        tarea: "edicion",
        config: {
          cadenas: {
            edicion: [
              { proveedor: "openrouter", modelo: "modelo/or" },
              { proveedor: "hf-space", modelo: null },
            ],
          },
        },
        pinPersona: { proveedor: "hf-space", modelo: "modelo/pin" },
      }),
    ).toEqual([
      { proveedor: "hf-space", modelo: "modelo/pin" },
      { proveedor: "openrouter", modelo: "modelo/or" },
    ]);
  });

  it("sin documento usa `.env`/D55 aunque haya pin", () => {
    const cadena = resolverCadena({
      tarea: "edicion",
      config: null,
      pinPersona: { proveedor: "huggingface", modelo: null },
    });

    expect(cadena[0]?.proveedor).toBe("huggingface");
    expect(cadena.filter((tramo) => tramo.proveedor === "huggingface")).toHaveLength(1);
    expect(cadena.some((tramo) => tramo.proveedor === "openrouter")).toBe(true);
  });

  it("rechaza una cadena de proyecto vacía y un pin con Ollama", () => {
    expect(() =>
      resolverCadena({
        tarea: "consulta",
        config: { cadenas: { consulta: [] } },
      }),
    ).toThrow(/está vacía/);

    expect(() =>
      resolverCadena({
        tarea: "edicion",
        pinPersona: { proveedor: "ollama", modelo: "qwen" },
      }),
    ).toThrow(/Ollama no forma parte/);
  });

  it("no repite el proveedor aunque la cadena lo mencione dos veces", () => {
    const cadena = resolverCadena({
      tarea: "edicion",
      config: {
        cadenas: {
          edicion: [
            { proveedor: "openrouter", modelo: "a" },
            { proveedor: "openrouter", modelo: "b" },
            { proveedor: "hf-space", modelo: null },
          ],
        },
      },
    });

    expect(cadena.map((tramo) => tramo.proveedor)).toEqual(["openrouter", "hf-space"]);
  });
});

describe("modeloDeTramo", () => {
  it("respeta el modelo explícito", () => {
    expect(modeloDeTramo({ proveedor: "hf-space", modelo: "propio/modelo" })).toBe(
      "propio/modelo",
    );
  });

  it("sin modelo usa el default del proveedor", () => {
    expect(modeloDeTramo({ proveedor: "hf-space", modelo: null })).not.toBe("");
  });
});

describe("formatearAvisoFallback", () => {
  it("no avisa si no hubo fallback", () => {
    expect(formatearAvisoFallback([], "openrouter")).toBeNull();
    expect(formatearAvisoFallback(undefined, "openrouter")).toBeNull();
  });

  it("nombra el proveedor que respondió y los que fallaron", () => {
    expect(
      formatearAvisoFallback(
        [
          { proveedor: "openrouter", modelo: "x", motivo: "429" },
          { proveedor: "openrouter", modelo: "x", motivo: "timeout" },
          { proveedor: "hf-space", modelo: "y", motivo: "5xx" },
        ],
        "huggingface",
      ),
    ).toBe("Respondió huggingface tras fallar openrouter, hf-space.");
  });
});
