import { HELP_ENTRIES } from "@/lib/ayuda/knowledge";

export interface HelpProjectItem {
  proyectoId: number;
  nombre: string;
}

export interface HelpAiResult {
  intent: "open_create_modal" | "open_project" | "download_backend" | "explain";
  text: string;
  projectId: number | null;
  helpIds: string[];
}

/** Contrato JSON que el modelo debe devolver (parseado tolerante en el cliente/route). */
export type HelpJsonShape = HelpAiResult;

/**
 * Prompt de sistema del asistente de /proyectos. Debe devolver UN objeto JSON
 * (sin código ni texto fuera del JSON) para que el cliente pueda ejecutar la
 * intención y además mostrar la respuesta en texto natural.
 */
export function buildHelpSystemPrompt(projects: HelpProjectItem[]): string {
  const knowledge = HELP_ENTRIES.map(
    (e) => `- [${e.id}] ${e.titulo} — “${e.pregunta}”`
  ).join("\n");

  const projectList =
    projects.length > 0
      ? projects.map((p) => `- ${p.proyectoId}: ${p.nombre}`).join("\n")
      : "El usuario todavía no tiene proyectos.";

  return `Eres el asistente de ayuda de "/proyectos" (diagramador UML colaborativo). El usuario te escribe en chat y espera una respuesta que su navegador PUEDE ejecutar.

# Proyectos actuales del usuario
${projectList}

# Base de conocimiento (id — tema)
${knowledge}

# Reglas de clasificación
- Órden directa de crear (p. ej. "crea un proyecto", "nuevo proyecto", "haz un proyecto") → intent "open_create_modal"; la UI abrirá el modal de creación, tu "text" puede saludar y decir qué campo llenar.
- Pedido de explicación o duda ("quiero crear un proyecto", "como creo un proyecto", "para que sirve X") → intent "explain" con "helpIds" apuntando a los ids de la base de conocimiento relevantes.
- "descargar/exportar el backend / zip" → intent "download_backend". Si el usuario menciona un proyecto concreto, pon su "projectId" (usa la lista de arriba; si el nombre coincide por substring claro, elígela; si es ambiguo, "projectId": null). En "text" siempre cuenta los pasos de descarga y, si "projectId" es null, lista los proyectos disponibles.
- "abre/entrar a <proyecto>" → intent "open_project" con el "projectId" correcto.
- Cualquier otra cosa → "explain".

# Formato de respuesta
Responde ÚNICAMENTE con un objeto JSON válido, sin markdown, sin texto antes ni después:
{"intent":"open_create_modal|open_project|download_backend|explain","text":"respuesta breve en español","projectId":number|null,"helpIds":["id_de_knowledge", ...]}

El campo "text" usa markdown ligero: **negrita**, \`codigo\`, listas con "-". Debe ser servicial y conciso.`;
}

/**
 * Parsea el JSON devuelto por el modelo de forma tolerante: aguanta corchetes
 * ```json, texto suelto antes/después y claves con nombres ES. Nunca lanza.
 */
export function parseHelpJson(raw: string): HelpJsonShape {
  const trimmed = (raw ?? "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  const body = fenced ? fenced[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  const slice = start === -1 || end === -1 || end < start ? body : body.slice(start, end + 1);
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(slice);
  } catch {
    // JSON inválido → responde como explain con el texto crudo
  }
  if (!parsed || typeof parsed !== "object") {
    return { intent: "explain", text: trimmed || "No pude procesar la respuesta.", projectId: null, helpIds: [] };
  }
  const o = parsed as Record<string, unknown>;
  const intentRaw = String(o.intent ?? "explain") as HelpJsonShape["intent"];
  const intent: HelpJsonShape["intent"] =
    intentRaw === "open_create_modal" || intentRaw === "open_project" || intentRaw === "download_backend"
      ? intentRaw
      : "explain";
  const projectId =
    typeof o.projectId === "number" ? o.projectId : typeof o.projectId === "string" ? Number(o.projectId) : null;
  return {
    intent,
    text: typeof o.text === "string" && o.text.trim() ? o.text : defaultText(intent),
    projectId: Number.isFinite(projectId) ? projectId : null,
    helpIds: Array.isArray(o.helpIds)
      ? o.helpIds.filter((x) => typeof x === "string").map(String)
      : [],
  };
}

function defaultText(intent: HelpJsonShape["intent"]): string {
  if (intent === "open_create_modal") return "Perfecto, te abro el modal de **Nuevo Proyecto**.";
  if (intent === "open_project") return "Te abro el proyecto en el editor.";
  if (intent === "download_backend") return "Te cuento cómo descargar el backend: abre el proyecto → **Exportar Backend** → **Descargar ZIP**.";
  return "Te ayudo con eso. Pregúntame por crear proyecto, descargar backend o usar la IA.";
}