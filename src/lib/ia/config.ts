import type { IAProvider } from "./types";

export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
// Túnel Cloudflare para el examen (mismo adapter ollama, distinta URL).
export const OLLAMA_TUNEL_URL =
  process.env.NEXT_PUBLIC_OLLAMA_TUNEL_URL?.trim() ||
  process.env.OLLAMA_TUNEL_URL?.trim() ||
  OLLAMA_BASE_URL;
/**
 * HF Spaces con formato `POST /generate`.
 *
 * Antes todo el proveedor `hf-space` apuntaba a un único Space (el de
 * CHRISTS20). Ahora cada modelo del selector resuelve su propio Space, de modo
 * que elegir `piloto-qwen2.5coder` envía las consultas al Space propio y no al
 * heredado.
 *
 * `HF_SPACE_URL` se conserva como alias del Space por defecto (el propio) para
 * no romper despliegues ni el proveedor falso de `test/`.
 */
const HF_SPACE_ENV_URL =
  process.env.NEXT_PUBLIC_HF_SPACE_PROPIO_URL?.trim() ||
  process.env.HF_SPACE_PROPIO_URL?.trim() ||
  process.env.NEXT_PUBLIC_HF_SPACE_URL?.trim() ||
  process.env.HF_SPACE_URL?.trim() ||
  "";
/** Space propio: Qwen2.5-Coder-7B-Instruct. */
export const HF_SPACE_PROPIO_URL =
  HF_SPACE_ENV_URL || "https://alexsolizduran-piloto-qwen2-5coder.hf.space";
/** Space LoRA heredado; sigue disponible como opción del selector. */
export const HF_SPACE_CHRISTS20_URL =
  process.env.NEXT_PUBLIC_HF_SPACE_CHRISTS20_URL?.trim() ||
  process.env.HF_SPACE_CHRISTS20_URL?.trim() ||
  "https://CHRISTS20-qwn-uml-space.hf.space";
/** Alias de compatibilidad: Space usado por defecto y por `/health`. */
export const HF_SPACE_URL = HF_SPACE_PROPIO_URL;

/** Nombre visible del modelo propio en el selector. */
export const HF_SPACE_MODEL_PROPIO = "piloto-qwen2.5coder";
export const HF_SPACE_MODEL_QWEN = "Qwen/Qwen2.5-Coder-7B-Instruct";
export const HF_SPACE_MODEL_LORA = "CHRISTS20/qwn-uml-lora-7b-v2";
/** Modelo del Space que se usa cuando el tramo no fija uno. */
export const IA_HF_SPACE_MODEL =
  process.env.NEXT_PUBLIC_IA_HF_SPACE_MODEL?.trim() ||
  process.env.IA_HF_SPACE_MODEL?.trim() ||
  HF_SPACE_MODEL_PROPIO;

/**
 * DSL canónico para el Space propio.
 *
 * Solo se activa cuando el modelo resuelve a `HF_SPACE_PROPIO_URL` y el turno
 * ofrece tools de escritura. El Space LoRA, los demás proveedores y el modo
 * plan siguen usando el parser JSON de siempre.
 *
 * Activado por defecto; `IA_HF_SPACE_DSL=0` lo desactiva sin tocar código.
 */
export const IA_HF_SPACE_DSL =
  (process.env.NEXT_PUBLIC_IA_HF_SPACE_DSL?.trim() ||
    process.env.IA_HF_SPACE_DSL?.trim() ||
    "1") !== "0";

/** Tope de tokens de salida del DSL. El diagrama completo puede ser grande. */
export const IA_HF_SPACE_DSL_MAX_TOKENS = Number(
  process.env.NEXT_PUBLIC_IA_HF_SPACE_DSL_MAX_TOKENS?.trim() ||
    process.env.IA_HF_SPACE_DSL_MAX_TOKENS?.trim() ||
    "1536",
);

export interface EspacioModeloHF {
  /** ID que muestra el selector y que se guarda en la atribución del mensaje. */
  id: string;
  /** Base del Space que atiende ese ID. */
  url: string;
  /** Modelo real que corre dentro del Space (informativo). */
  modelo: string;
}

/**
 * Registro modelo → Space. El orden es el del selector: primero el propio.
 * `Qwen/Qwen2.5-Coder-7B-Instruct` se mantiene por compatibilidad con valores
 * guardados en `.env` o en configuraciones de proyecto antiguas y también
 * resuelve al Space propio.
 */
export const HF_SPACE_MODELOS: readonly EspacioModeloHF[] = [
  { id: HF_SPACE_MODEL_PROPIO, url: HF_SPACE_PROPIO_URL, modelo: HF_SPACE_MODEL_QWEN },
  { id: HF_SPACE_MODEL_LORA, url: HF_SPACE_CHRISTS20_URL, modelo: HF_SPACE_MODEL_LORA },
  { id: HF_SPACE_MODEL_QWEN, url: HF_SPACE_PROPIO_URL, modelo: HF_SPACE_MODEL_QWEN },
];

/** Resuelve el Space de un modelo; sin coincidencia usa el propio. */
export function resolverSpaceHf(modelo?: string | null): EspacioModeloHF {
  const buscado = (modelo ?? "").trim().toLowerCase();
  const encontrado = HF_SPACE_MODELOS.find((entrada) => entrada.id.toLowerCase() === buscado);
  return encontrado ?? HF_SPACE_MODELOS[0];
}

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
/** Modelo VL del fallback de visión por router HF cuando el túnel cae. */
export const IA_VISION_HF_MODEL =
  process.env.NEXT_PUBLIC_IA_VISION_HF_MODEL?.trim() ||
  process.env.IA_VISION_HF_MODEL?.trim() ||
  "Qwen/Qwen3-VL-30B-A3B-Instruct";
/**
 * Tope de tokens de salida de la ruta visión.
 *
 * Un diagrama con varias tablas y relaciones no cabe en los 2048 tokens del
 * chat normal: el JSON se truncaba a mitad de objeto y `parseVisionJson`
 * devolvía `null` ("La visión no devolvió un esquema válido").
 */
export const IA_VISION_MAX_TOKENS = Number(process.env.IA_VISION_MAX_TOKENS ?? "8192");
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
/** Turnos de historial que se envían al modelo (un turno empieza en un mensaje del usuario). */
export const IA_MAX_HISTORY_TURNS = Number(process.env.IA_MAX_HISTORY_TURNS ?? "6");
export const IA_CHAT_TIMEOUT_MS = Number(process.env.IA_CHAT_TIMEOUT_MS ?? "120000");
export const IA_NUM_CTX = Number(process.env.IA_NUM_CTX ?? "8192");

/**
 * Router de proveedores (fase 8, D55). Cadena por tarea en formato
 * `proveedor:modelo,proveedor`. El modelo de un tramo puede omitirse: se usa el
 * default del proveedor.
 */
export const IA_CADENA_EDICION =
  process.env.NEXT_PUBLIC_IA_CADENA_EDICION?.trim() ||
  process.env.IA_CADENA_EDICION?.trim() ||
  "openrouter,hf-space";
export const IA_CADENA_CONSULTA =
  process.env.NEXT_PUBLIC_IA_CADENA_CONSULTA?.trim() ||
  process.env.IA_CADENA_CONSULTA?.trim() ||
  "hf-space,openrouter";
export const IA_CADENA_RESUMEN =
  process.env.NEXT_PUBLIC_IA_CADENA_RESUMEN?.trim() ||
  process.env.IA_CADENA_RESUMEN?.trim() ||
  "hf-space";

/**
 * Tope del turno completo, incluyendo reintentos y tramos. Es el doble del
 * timeout de un intento: permite un reintento y un tramo de respaldo, pero no
 * deja que una cadena de dos proveedores se cuelgue indefinidamente (D56).
 */
export const IA_FALLBACK_TIMEOUT_MS = Number(
  process.env.NEXT_PUBLIC_IA_FALLBACK_TIMEOUT_MS ??
    process.env.IA_FALLBACK_TIMEOUT_MS ??
    String(IA_CHAT_TIMEOUT_MS * 2),
);

/**
 * Límite de uso del proxy de IA por usuario (fase 9, D66). `0` desactiva el
 * cubo correspondiente. El límite autoritativo de turnos vive en Nest.
 */
export const IA_LIMITE_CHAT_MINUTO = Number(process.env.IA_LIMITE_CHAT_MINUTO ?? "20");
export const IA_LIMITE_CHAT_HORA = Number(process.env.IA_LIMITE_CHAT_HORA ?? "200");


/**
 * Resumen rodante de la sala (fase 7).
 *
 * Se genera en el cliente que termina el turno, cada `IA_RESUMEN_CADA` mensajes
 * pendientes. Es best-effort: nunca bloquea ni hace fallar la respuesta.
 */
export const IA_RESUMEN_CADA = Number(process.env.IA_RESUMEN_CADA ?? "20");
export const IA_RESUMEN_MAX_MENSAJES = Number(process.env.IA_RESUMEN_MAX_MENSAJES ?? "80");
export const IA_RESUMEN_PROVIDER: IAProvider = (() => {
  const raw =
    process.env.NEXT_PUBLIC_IA_RESUMEN_PROVIDER?.trim() ||
    process.env.IA_RESUMEN_PROVIDER?.trim() ||
    "";
  if (raw === "huggingface" || raw === "ollama" || raw === "hf-space" || raw === "openrouter") {
    return raw as IAProvider;
  }
  return IA_DEFAULT_PROVIDER;
})();
export const IA_RESUMEN_MODEL =
  process.env.NEXT_PUBLIC_IA_RESUMEN_MODEL?.trim() ||
  process.env.IA_RESUMEN_MODEL?.trim() ||
  IA_DEFAULT_MODEL;

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

/**
 * Único modelo de OpenRouter que usa la app (fase 8+).
 *
 *  - Ruta visión: foto → proyecto (CreateProjectModal / runVisionImport).
 *  - Apartado GRUPAL: el selector del asistente solo ofrece este modelo
 *    (listModels() de OpenRouter ya no barre el catálogo `:free`).
 *
 * En Vercel se setea `IA_OPENROUTER_MODEL`; la variante `NEXT_PUBLIC_`
 * existe para que el navegador (modal de crear proyecto, selector del
 * panel) pueda resolverla sin llamada al servidor. Se leen las dos para
 * que cualquiera de los dos nombres funcione.
 */
export const IA_OPENROUTER_MODEL =
  process.env.NEXT_PUBLIC_IA_OPENROUTER_MODEL?.trim() ||
  process.env.IA_OPENROUTER_MODEL?.trim() ||
  "";

/** Modelo usado por la ruta /api/ia/help (usa el primero de tus 3). */
export const IA_HELP_MODEL =
  process.env.NEXT_PUBLIC_IA_HELP_MODEL?.trim() ||
  process.env.IA_HELP_MODEL?.trim() ||
  OPENROUTER_DEFAULT_MODEL;

/**
 * Speech-to-text (HF Space `AlexSolizDuran/ia-voztotext`).
 *
 * El navegador nunca llama al Space directamente: usa el proxy
 * `/api/ia/transcribe` para evitar CORS y validar la sesión. El Space duerme
 * por inactividad, por eso el timeout es amplio y el mensaje de error avisa
 * de que puede estar iniciándose.
 */
export const HF_STT_SPACE_URL =
  process.env.NEXT_PUBLIC_HF_STT_SPACE_URL?.trim() ||
  process.env.HF_STT_SPACE_URL?.trim() ||
  "https://alexsolizduran-ia-voztotext.hf.space";
export const IA_STT_TIMEOUT_MS = Number(process.env.IA_STT_TIMEOUT_MS ?? "180000");
export const IA_STT_MAX_BYTES = Number(
  process.env.IA_STT_MAX_BYTES ?? String(20 * 1024 * 1024),
);
/** Duración máxima de una grabación de dictado. */
export const IA_STT_MAX_DURACION_MS = Number(
  process.env.NEXT_PUBLIC_IA_STT_MAX_DURACION_MS ?? process.env.IA_STT_MAX_DURACION_MS ?? "60000",
);
