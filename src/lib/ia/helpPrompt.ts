import { HELP_ENTRIES } from "@/lib/ayuda/knowledge";

export interface HelpProjectItem {
  proyectoId: number;
  nombre: string;
}

/** Acciones reales sobre la web que el asistente puede pedir al navegador. */
export type HelpToolName =
  | "crear_proyecto"
  | "abrir_proyecto"
  | "invitar_colaborador"
  | "abrir_modulo"
  | "exportar_backend"
  | "explicar";

export const HELP_TOOL_NAMES: readonly HelpToolName[] = [
  "crear_proyecto",
  "abrir_proyecto",
  "invitar_colaborador",
  "abrir_modulo",
  "exportar_backend",
  "explicar",
];

export interface HelpAiResult {
  tool: HelpToolName;
  args: Record<string, unknown>;
  text: string;
  projectId: number | null;
  helpIds: string[];
}

const TOOL_CATALOG = [
  `- crear_proyecto {"nombre": string} — crea el proyecto y abre su editor. Solo si la persona lo pide como orden ("crea un proyecto llamado veterinaria"). El nombre va sin espacios ni tildes.`,
  `- abrir_proyecto {"proyectoId": number} — abre en el editor un proyecto de la lista.`,
  `- invitar_colaborador {"proyectoId": number, "username": string, "rol": "LECTOR" | "EDITOR"} — añade a esa persona al proyecto (solo el creador puede). Nunca lo uses con datos inventados: el username debe venir en el mensaje.`,
  `- abrir_modulo {"destino": "proyectos" | "configuracion"} — navega a esa sección de la web.`,
  `- exportar_backend {"proyectoId": number} — abre la descarga del backend Spring Boot del proyecto.`,
  `- explicar {"helpIds": string[]} — responde una duda usando la base de conocimiento de la web (preguntas, pasos, funciones). Es la opción por defecto.`,
].join("\n");

/**
 * Prompt del asistente web. Debe devolver UN objeto JSON (sin código ni texto
 * fuera del JSON) con la herramienta elegida, sus argumentos y la respuesta
 * visible. El navegador ejecuta la herramienta y muestra el texto.
 */
export function buildHelpSystemPrompt(
  projects: HelpProjectItem[],
  pagina?: string,
): string {
  const knowledge = HELP_ENTRIES.map(
    (e) => `- [${e.id}] ${e.titulo} — “${e.pregunta}”`,
  ).join("\n");

  const projectList =
    projects.length > 0
      ? projects.map((p) => `- ${p.proyectoId}: ${p.nombre}`).join("\n")
      : "El usuario todavía no tiene proyectos.";

  return `Eres el **asistente de la web** del diagramador UML colaborativo. Respondes dudas sobre cómo usar la aplicación y, cuando hace falta, ejecutas una acción real del navegador. NUNCA hablas del contenido del diagrama: para eso existen el chat grupal y el privado.

# Página donde está la persona
${pagina ?? "/proyectos"}

# Proyectos actuales del usuario
${projectList}

# Herramientas disponibles
${TOOL_CATALOG}

# Reglas
- Una sola herramienta por respuesta, la más específica que corresponda.
- Si la persona solo pregunta cómo se hace algo, usa \`explicar\` con los ids relevantes de la base de conocimiento.
- Si pide una acción ("crea…", "abre…", "invita…", "descarga…"), usa la herramienta concreta. En "text" cuenta qué vas a hacer o el resultado esperado.
- "invitar_colaborador" solo si tienes proyecto y username claros. Si falta el username, no inventes: pide que lo escriba.
- Si un nombre de proyecto coincide por substring claro con la lista, usa su id; si es ambiguo, deja projectId en null y pide que elija.
- Nunca inventes ids de proyecto, usuarios ni ids de la base de conocimiento.
- Responde en español, breve, con markdown ligero (**negrita**, \`codigo\`, listas con "-").

# Base de conocimiento (id — tema)
${knowledge}

# Formato de respuesta
Responde ÚNICAMENTE con un objeto JSON válido, sin markdown ni texto fuera:
{"tool":"crear_proyecto|abrir_proyecto|invitar_colaborador|abrir_modulo|exportar_backend|explicar","args":{...},"text":"respuesta breve en español","projectId":number|null,"helpIds":["id_de_knowledge", ...]}`;
}

/**
 * Parsea el JSON del modelo de forma tolerante: aguanta ```json, texto suelto
 * antes/después y nombres de herramienta desconocidos. Nunca lanza.
 */
export function parseHelpJson(raw: string): HelpAiResult {
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
    // JSON inválido → se responde como explicación con el texto crudo
  }
  if (!parsed || typeof parsed !== "object") {
    return {
      tool: "explicar",
      args: {},
      text: trimmed || "No pude procesar la respuesta.",
      projectId: null,
      helpIds: [],
    };
  }
  const o = parsed as Record<string, unknown>;
  const toolRaw = String(o.tool ?? o.herramienta ?? "");
  const tool = (HELP_TOOL_NAMES as readonly string[]).includes(toolRaw)
    ? (toolRaw as HelpToolName)
    : "explicar";
  const args =
    o.args && typeof o.args === "object" && !Array.isArray(o.args)
      ? (o.args as Record<string, unknown>)
      : {};
  const projectId =
    typeof o.projectId === "number"
      ? o.projectId
      : typeof o.projectId === "string"
        ? Number(o.projectId)
        : null;
  return {
    tool,
    args,
    text: typeof o.text === "string" && o.text.trim() ? o.text : defaultText(tool),
    projectId: Number.isFinite(projectId) ? (projectId as number) : null,
    helpIds: Array.isArray(o.helpIds)
      ? o.helpIds.filter((x) => typeof x === "string").map(String)
      : [],
  };
}

function defaultText(tool: HelpToolName): string {
  switch (tool) {
    case "crear_proyecto":
      return "Voy a crear el proyecto y abrir su editor.";
    case "abrir_proyecto":
      return "Abriendo el proyecto en el editor…";
    case "invitar_colaborador":
      return "Voy a añadir a esa persona al proyecto.";
    case "abrir_modulo":
      return "Te llevo a esa sección.";
    case "exportar_backend":
      return "Abriendo la descarga del backend del proyecto…";
    default:
      return "Te ayudo con eso. Pregúntame por crear proyectos, invitar colaboradores o cualquier función de la web.";
  }
}
