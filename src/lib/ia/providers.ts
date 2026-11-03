import type { IAProvider } from "./types";
import { IA_NUM_CTX } from "./config";

/**
 * Perfil de un proveedor: lo único que cambia entre ellos para el presupuesto
 * de contexto. El prompt, las herramientas y el formato de mensajes no cambian.
 */
export interface ProviderProfile {
  id: IAProvider;
  /** Ventana total de entrada + salida declarada por el proveedor. */
  contextWindow: number;
  /** Tokens reservados para la respuesta. */
  maxOutput: number;
}

function numero(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

/**
 * Los overrides se leen en tiempo de ejecución para que un mismo `.env` gobierne
 * cliente y servidor y para poder ajustarlos sin recompilar.
 */
export function perfilDeProveedor(provider: IAProvider): ProviderProfile {
  switch (provider) {
    case "ollama":
      // Sin uso ni documentación en la cadena actual; el adaptador se conserva.
      return {
        id: provider,
        contextWindow: numero(process.env.IA_CONTEXT_OLLAMA, numero(process.env.IA_NUM_CTX, IA_NUM_CTX)),
        maxOutput: 2048,
      };
    case "openrouter":
      return {
        id: provider,
        contextWindow: numero(process.env.IA_CONTEXT_OPENROUTER, 131072),
        maxOutput: 2048,
      };
    case "huggingface":
      return {
        id: provider,
        contextWindow: numero(process.env.IA_CONTEXT_HUGGINGFACE, 16384),
        maxOutput: 2048,
      };
    case "hf-space":
      return {
        id: provider,
        contextWindow: numero(process.env.IA_CONTEXT_HF_SPACE, 4096),
        maxOutput: 512,
      };
  }
}

export const PERFILES: Record<IAProvider, ProviderProfile> = {
  ollama: perfilDeProveedor("ollama"),
  openrouter: perfilDeProveedor("openrouter"),
  huggingface: perfilDeProveedor("huggingface"),
  "hf-space": perfilDeProveedor("hf-space"),
};
