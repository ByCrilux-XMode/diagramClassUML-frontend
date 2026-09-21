import type { IAProvider } from "./types";

export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
export const HF_BASE_URL = process.env.HF_BASE_URL?.trim() || "https://api-inference.huggingface.co";
export const HF_TOKEN = process.env.HF_TOKEN?.trim() ?? "";
/**
 * Config IA por .env — cada clave se lee en este orden para que un mismo
 * .env gobierne servidor y navegador (el bundle cliente solo inlina las
 * NEXT_PUBLIC_* con nombre literal; por eso NO usar acceso dinámico):
 *   1. NEXT_PUBLIC_IA_* (visible en cliente y servidor)
 *   2. IA_* (solo servidor: rutas /api/ia/*)
 *   3. fallback local (Ollama)
 * Migración a Hugging Face: basta con setear las claves en .env.
 */
export const IA_DEFAULT_PROVIDER: IAProvider =
  (process.env.NEXT_PUBLIC_IA_DEFAULT_PROVIDER?.trim() ||
    process.env.IA_DEFAULT_PROVIDER?.trim()) === "huggingface"
    ? "huggingface"
    : "ollama";
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
  if (raw === "huggingface" || raw === "ollama") return raw;
  return IA_DEFAULT_PROVIDER;
})();
export const IA_MAX_TOOL_ROUNDS = Number(process.env.IA_MAX_TOOL_ROUNDS ?? "10");
export const IA_CHAT_TIMEOUT_MS = Number(process.env.IA_CHAT_TIMEOUT_MS ?? "120000");
export const IA_NUM_CTX = Number(process.env.IA_NUM_CTX ?? "8192");