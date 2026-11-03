import {
  IA_CADENA_CONSULTA,
  IA_CADENA_EDICION,
  IA_CADENA_RESUMEN,
  IA_DEFAULT_MODEL,
  OPENROUTER_DEFAULT_MODEL,
} from "./config";
import type { IAProvider } from "./types";

/**
 * Router de proveedores (fase 8).
 *
 * Resuelve qué cadena de tramos usa un turno según su tarea. La cadena puede
 * venir de `config_ia`; si no, se usan los defaults de `.env`/D55. El proveedor
 * elegido en el selector es solo un pin del primer tramo (D59): los respaldos
 * siguen saliendo de la cadena del proyecto.
 */

export type TareaIA = "edicion" | "consulta" | "resumen";

export interface TramoProveedor {
  proveedor: IAProvider;
  /** `null` usa el modelo por defecto del proveedor. */
  modelo: string | null;
}

export type MotivoFallback = "timeout" | "red" | "429" | "5xx" | "respuesta-invalida";

/** Proveedores que pueden aparecer en una cadena. Ollama queda fuera (D61). */
export const PROVEEDORES_CADENA = ["openrouter", "hf-space", "huggingface"] as const;
export type ProveedorCadena = (typeof PROVEEDORES_CADENA)[number];

export interface ConfigCadena {
  cadenas?: Partial<Record<TareaIA, TramoProveedor[]>>;
}

export interface PinPersona {
  proveedor?: IAProvider | null;
  modelo?: string | null;
}

export class ErrorCadena extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorCadena";
  }
}

const CADENAS_POR_ENTORNO: Record<TareaIA, string> = {
  edicion: IA_CADENA_EDICION,
  consulta: IA_CADENA_CONSULTA,
  resumen: IA_CADENA_RESUMEN,
};

export function esProveedorCadena(valor: unknown): valor is ProveedorCadena {
  return typeof valor === "string" && (PROVEEDORES_CADENA as readonly string[]).includes(valor);
}

/**
 * Parsea `proveedor:modelo,proveedor`. Una cadena vacía devuelve `[]`; un
 * proveedor desconocido u Ollama lanza un error de configuración legible.
 */
export function parsearCadena(valor: string): TramoProveedor[] {
  const texto = (valor ?? "").trim();
  if (texto === "") return [];

  return texto.split(",").map((parte) => {
    const tramo = parte.trim();
    if (tramo === "") throw new ErrorCadena("La cadena contiene un tramo vacío.");

    const separador = tramo.indexOf(":");
    const proveedor = (separador === -1 ? tramo : tramo.slice(0, separador)).trim().toLowerCase();
    if (proveedor === "ollama") {
      throw new ErrorCadena(
        "Ollama no forma parte de la cadena de proveedores. Usa openrouter, hf-space o huggingface.",
      );
    }
    if (!esProveedorCadena(proveedor)) {
      throw new ErrorCadena(`Proveedor no permitido en la cadena: ${proveedor}`);
    }
    const modelo = separador === -1 ? "" : tramo.slice(separador + 1).trim();
    return { proveedor, modelo: modelo === "" ? null : modelo };
  });
}

function normalizarCadena(tramos: TramoProveedor[]): TramoProveedor[] {
  return tramos.map((tramo) => {
    const proveedor =
      typeof tramo.proveedor === "string" ? tramo.proveedor.trim().toLowerCase() : "";
    if (proveedor === "ollama") {
      throw new ErrorCadena(
        "Ollama no forma parte de la cadena de proveedores. Usa openrouter, hf-space o huggingface.",
      );
    }
    if (!esProveedorCadena(proveedor)) {
      throw new ErrorCadena(`Proveedor no permitido en la cadena: ${tramo.proveedor}`);
    }
    const modelo = tramo.modelo?.trim() ?? "";
    return { proveedor, modelo: modelo === "" ? null : modelo };
  });
}

function cadenaBase(tarea: TareaIA, config?: ConfigCadena | null): TramoProveedor[] {
  const configurada = config?.cadenas?.[tarea];
  if (configurada !== undefined) {
    if (configurada.length === 0) {
      throw new ErrorCadena(`La cadena de ${tarea} está vacía.`);
    }
    return normalizarCadena(configurada);
  }

  const porEntorno = parsearCadena(CADENAS_POR_ENTORNO[tarea]);
  if (porEntorno.length === 0) {
    throw new ErrorCadena(
      `No hay proveedores configurados para la tarea ${tarea}. Revisa IA_CADENA_${tarea.toUpperCase()}.`,
    );
  }
  return porEntorno;
}

function modeloDeLaCadena(cadena: TramoProveedor[], proveedor: IAProvider): string | null {
  return cadena.find((tramo) => tramo.proveedor === proveedor)?.modelo ?? null;
}

/**
 * Resuelve la cadena efectiva de un turno.
 *
 * Precedencia (D59): cadena del proyecto → `.env` → default de D55. Si la
 * persona fijó un proveedor, ese va primero y no se repite en los respaldos.
 */
export function resolverCadena(input: {
  tarea: TareaIA;
  config?: ConfigCadena | null;
  pinPersona?: PinPersona | null;
}): TramoProveedor[] {
  const base = cadenaBase(input.tarea, input.config);
  const pin = input.pinPersona;
  const tramos: TramoProveedor[] = [];

  if (pin?.proveedor) {
    const proveedor = pin.proveedor.trim().toLowerCase();
    if (proveedor === "ollama") {
      throw new ErrorCadena(
        "Ollama no forma parte de la cadena de proveedores. Usa openrouter, hf-space o huggingface.",
      );
    }
    if (!esProveedorCadena(proveedor)) {
      throw new ErrorCadena(`Proveedor no permitido en la cadena: ${pin.proveedor}`);
    }
    const modeloPin = pin.modelo?.trim() || modeloDeLaCadena(base, proveedor);
    tramos.push({ proveedor, modelo: modeloPin });
  }

  for (const tramo of base) {
    if (tramos.some((elegido) => elegido.proveedor === tramo.proveedor)) continue;
    tramos.push({ ...tramo });
  }

  if (tramos.length === 0) {
    throw new ErrorCadena("La cadena de proveedores quedó vacía; revisa la configuración.");
  }
  return tramos;
}

/**
 * Modelo efectivo de un tramo: el explícito o el default del proveedor.
 *
 * En OpenRouter nunca se cae a `IA_DEFAULT_MODEL`: ese valor puede ser un tag de
 * Ollama (`qwen2.5-coder:7b`) que OpenRouter rechaza con HTTP 400. Si el
 * navegador no conoce el default (solo llegan las claves `NEXT_PUBLIC_*`), se
 * envía vacío y `/api/ia/chat` lo resuelve con la configuración del servidor.
 */
export function modeloDeTramo(tramo: TramoProveedor): string {
  const explicito = tramo.modelo?.trim();
  if (explicito) return explicito;
  if (tramo.proveedor === "openrouter") {
    return OPENROUTER_DEFAULT_MODEL;
  }
  return IA_DEFAULT_MODEL;
}

export interface FallbackRegistrado {
  proveedor: IAProvider;
  modelo: string;
  motivo: MotivoFallback;
}

/** Aviso discreto para el panel; `null` si no hubo fallback (D62). */
export function formatearAvisoFallback(
  fallbacks: FallbackRegistrado[] | undefined | null,
  proveedorUsado?: IAProvider | null,
): string | null {
  if (!fallbacks || fallbacks.length === 0) return null;
  const fallidos = [...new Set(fallbacks.map((fallback) => fallback.proveedor))];
  const destino = proveedorUsado ? `Respondió ${proveedorUsado}` : "Respondió un respaldo";
  return `${destino} tras fallar ${fallidos.join(", ")}.`;
}
