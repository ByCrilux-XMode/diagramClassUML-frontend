import type { IAProvider } from "./types";

export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
// Túnel Cloudflare para el examen (mismo adapter ollama, distinta URL).
export const OLLAMA_TUNEL_URL =
  process.env.NEXT_PUBLIC_OLLAMA_TUNEL_URL?.trim() ||
  process.env.OLLAMA_TUNEL_URL?.trim() ||
  OLLAMA_BASE_URL;
// HF Space LoRA respaldo (público, ZeroGPU) — https://CHRISTS20-qwn-uml-space.hf.space
export const HF_SPACE_URL =
  process.env.NEXT_PUBLIC_HF_SPACE_URL?.trim() ||
  process.env.HF_SPACE_URL?.trim() ||
  "https://CHRISTS20-qwn-uml-space.hf.space";
/**
 * Router de Inference Providers: endpoint OpenAI-compatible ACTUAL de Hugging
 * Face. El host heredado api-inference.huggingface.co dejó de existir en DNS y
 * hace que el servidor lance "fetch failed". Para desactivar este router y
 * volver al comportamiento heredado usa HF_USE_ROUTER=0 (también cambia el
 * origen del listado de modelos).
 */
export const HF_USE_ROUTER =
  (process.env.NEXT_PUBLIC_HF_USE_ROUTER?.trim() || process.env.HF_USE_ROUTER?.trim() || "1") !== "0";
export const HF_BASE_URL =
  process.env.HF_BASE_URL?.trim() ||
  (HF_USE_ROUTER ? "https://router.huggingface.co" : "https://api-inference.huggingface.co");
export const HF_TOKEN = process.env.HF_TOKEN?.trim() ?? "";
/**
 * Fuente del listado de modelos de chat:
 *  - router: /v1/models → solo modelos que el router puede servir.
 *  - heredado: top 24 "conversational" del Hub (muchos no los sirve el router).
 */
export const HF_MODELS_URL = HF_USE_ROUTER
  ? "https://router.huggingface.co/v1/models"
  : "https://huggingface.co/api/models?sort=likes&limit=24&filter=conversational";
/**
 * Config IA por .env — cada clave se lee en este orden para que un mismo
 * .env gobierne servidor y navegador (el bundle cliente solo inlina las
 * NEXT_PUBLIC_* con nombre literal; por eso NO usar acceso dinámico):
 *   1. NEXT_PUBLIC_IA_* (visible en cliente y servidor)
 *   2. IA_* (solo servidor: rutas /api/ia/*)
 *   3. fallback local (Ollama)
 * Migración a Hugging Face: basta con setear las claves en .env.
 */
export const IA_DEFAULT_PROVIDER: IAProvider = (() => {
  const raw =
    process.env.NEXT_PUBLIC_IA_DEFAULT_PROVIDER?.trim() ||
    process.env.IA_DEFAULT_PROVIDER?.trim() ||
    "";
  if (raw === "huggingface" || raw === "openrouter" || raw === "hf-space") return raw as IAProvider;
  return "ollama";
})();
export const IA_DEFAULT_MODEL =
  process.env.NEXT_PUBLIC_IA_DEFAULT_MODEL?.trim() ||
  process.env.IA_DEFAULT_MODEL?.trim() ||
  "qwen2.5-coder:7b";
/** Modelo de visión (foto→esquema). Default: diagrams2sql local. */
export const IA_VISION_MODEL =
  process.env.NEXT_PUBLIC_IA_VISION_MODEL?.trim() ||
  process.env.IA_VISION_MODEL?.trim() ||
  "qwen3.5:4b";
/**
 * Provider de la ruta visión. Default: el mismo que IA_DEFAULT_PROVIDER
 * (un solo switch migra todo). Se puede independizar, ej. chat en HF
 * y visión siguiendo en Ollama local.
 */
export const IA_VISION_PROVIDER: IAProvider = (() => {
  const raw =
    process.env.NEXT_PUBLIC_IA_VISION_PROVIDER?.trim() ||
    process.env.IA_VISION_PROVIDER?.trim() ||
    "";
  if (raw === "huggingface" || raw === "ollama" || raw === "hf-space" || raw === "openrouter") return raw as IAProvider;
  return IA_DEFAULT_PROVIDER;
})();
export const IA_MAX_TOOL_ROUNDS = Number(process.env.IA_MAX_TOOL_ROUNDS ?? "10");
export const IA_CHAT_TIMEOUT_MS = Number(process.env.IA_CHAT_TIMEOUT_MS ?? "120000");
export const IA_NUM_CTX = Number(process.env.IA_NUM_CTX ?? "8192");

/**
 * OpenRouter — 1 key (server-side, nunca NEXT_PUBLIC_) + 3 modelos
 * (IDs públicos, visibles en cliente para el fallback del modal).
 */
export const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai";
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY?.trim() ?? "";
// 3 modelos configurables por ti — lee tanto NEXT_PUBLIC_ (cliente) como sin prefijo (servidor)
export const OPENROUTER_MODELS: string[] = [
  process.env.NEXT_PUBLIC_OPENROUTER_MODEL?.trim() || process.env.OPENROUTER_MODEL?.trim(),
  process.env.NEXT_PUBLIC_OPENROUTER_MODEL_1?.trim() || process.env.OPENROUTER_MODEL_1?.trim(),
  process.env.NEXT_PUBLIC_OPENROUTER_MODEL_2?.trim() || process.env.OPENROUTER_MODEL_2?.trim(),
  ...(process.env.NEXT_PUBLIC_OPENROUTER_MODELS?.trim() || process.env.OPENROUTER_MODELS || "").split(","),
]
  .map((s) => (s ?? "").trim())
  .filter((s) => s.length > 0);
// Compat: si aún usas OPENROUTER_DEFAULT_MODEL, también se incluye
const _legacyModel =
  process.env.NEXT_PUBLIC_OPENROUTER_DEFAULT_MODEL?.trim() ||
  process.env.OPENROUTER_DEFAULT_MODEL?.trim() ||
  "";
if (_legacyModel && !OPENROUTER_MODELS.includes(_legacyModel)) {
  OPENROUTER_MODELS.unshift(_legacyModel);
}
export const OPENROUTER_DEFAULT_MODEL = OPENROUTER_MODELS[0] ?? "";
/** Modelo usado por la ruta /api/ia/help (usa el primero de tus 3). */
export const IA_HELP_MODEL =
  process.env.NEXT_PUBLIC_IA_HELP_MODEL?.trim() ||
  process.env.IA_HELP_MODEL?.trim() ||
  OPENROUTER_DEFAULT_MODEL;