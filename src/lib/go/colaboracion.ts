import * as Y from "yjs";

export const CLAVE_ESQUEMA = "esquema";

function codificar(valor: unknown): unknown {
  if (valor === null || typeof valor !== "object") {
    return valor;
  }
  if (Array.isArray(valor)) {
    const arreglo = new Y.Array<unknown>();
    arreglo.push(valor.map((item) => codificar(item)));
    return arreglo;
  }
  const mapa = new Y.Map<unknown>();
  for (const [clave, item] of Object.entries(valor)) {
    mapa.set(clave, codificar(item));
  }
  return mapa;
}

function decodificar(valor: unknown): unknown {
  if (valor instanceof Y.Map) {
    const resultado: Record<string, unknown> = {};
    valor.forEach((item, clave) => {
      resultado[clave] = decodificar(item);
    });
    return resultado;
  }
  if (valor instanceof Y.Array) {
    return valor.toArray().map((item) => decodificar(item));
  }
  return valor;
}

export function aplicarEsquema(
  doc: Y.Doc,
  esquema: Record<string, unknown> | null | undefined,
  origen?: unknown
): void {
  const mapa = doc.getMap<unknown>(CLAVE_ESQUEMA);
  doc.transact(() => {
    mapa.forEach((_valor, clave) => {
      mapa.delete(clave);
    });
    if (esquema && typeof esquema === "object") {
      for (const [clave, valor] of Object.entries(esquema)) {
        mapa.set(clave, codificar(valor));
      }
    }
  }, origen);
}

export function extraerEsquema(doc: Y.Doc): Record<string, unknown> | null {
  const mapa = doc.getMap<unknown>(CLAVE_ESQUEMA);
  if (mapa.size === 0) {
    return null;
  }
  const resultado: Record<string, unknown> = {};
  mapa.forEach((valor, clave) => {
    resultado[clave] = decodificar(valor);
  });
  return resultado;
}

export function esquemaVacio(doc: Y.Doc): boolean {
  return doc.getMap<unknown>(CLAVE_ESQUEMA).size === 0;
}