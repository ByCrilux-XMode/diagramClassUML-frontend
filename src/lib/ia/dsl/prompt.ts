/**
 * Prompt del DSL canónico.
 *
 * Reemplaza la sección de estado del system prompt por una proyección
 * canónica con ids estables y añade el contrato de salida. El Space solo
 * acepta `system | user | assistant`, así que los mensajes `tool` se
 * convierten en `user` con un prefijo legible.
 */
import type { DiagramState } from "@/lib/editorTools";
import type { IAChatMessage } from "@/lib/ia/types";
import type { DiagramaCanonico } from "./canonical";
import { primerObjetoBalanceado } from "./repair";

export interface MensajeDsl {
  role: "system" | "user" | "assistant";
  content: string;
}

const MARCADORES_ESTADO = [
  "## Capa 2 · Estado actual del diagrama",
  "Estado actual del diagrama (JSON compacto",
];

function esEstado(valor: unknown): valor is DiagramState {
  if (typeof valor !== "object" || valor === null) return false;
  const objeto = valor as Record<string, unknown>;
  return Array.isArray(objeto.classes) && Array.isArray(objeto.links);
}

/**
 * Extrae el `DiagramState` del system prompt.
 *
 * Devuelve `null` si no hay snapshot, si está recortado por presupuesto o si
 * el JSON no se puede parsear. En esos casos el adaptador usa el camino
 * legacy.
 */
export function extraerSnapshot(systemPrompt: string): DiagramState | null {
  if (!systemPrompt || systemPrompt.trim() === "") return null;
  if (systemPrompt.includes("[miembros omitidos por presupuesto]")) return null;

  const marcador = MARCADORES_ESTADO.find((candidato) => systemPrompt.includes(candidato));
  if (!marcador) return null;

  const desde = systemPrompt.indexOf(marcador);
  const resto = systemPrompt.slice(desde);
  if (resto.includes("El diagrama está vacío")) {
    return { classes: [], links: [] };
  }

  const bloque = primerObjetoBalanceado(resto);
  if (!bloque) return null;
  try {
    const parsed: unknown = JSON.parse(bloque);
    return esEstado(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Quita la sección de estado del diagrama del system prompt. */
function quitarSeccionEstado(systemPrompt: string): string {
  const capa = "## Capa 2 · Estado actual del diagrama";
  const indiceCapa = systemPrompt.indexOf(capa);
  if (indiceCapa !== -1) {
    const siguiente = systemPrompt.indexOf("\n## ", indiceCapa + capa.length);
    return (
      systemPrompt.slice(0, indiceCapa).trimEnd() +
      (siguiente === -1 ? "" : `\n\n${systemPrompt.slice(siguiente + 1)}`)
    );
  }

  const legacy = "Estado actual del diagrama (JSON compacto";
  const indiceLegacy = systemPrompt.indexOf(legacy);
  if (indiceLegacy === -1) return systemPrompt.trimEnd();

  const resto = systemPrompt.slice(indiceLegacy);
  const bloque = primerObjetoBalanceado(resto);
  if (!bloque) return systemPrompt.slice(0, indiceLegacy).trimEnd();
  const fin = indiceLegacy + resto.indexOf(bloque) + bloque.length;
  return (systemPrompt.slice(0, indiceLegacy) + systemPrompt.slice(fin)).trimEnd();
}

/** Contrato de salida y few-shot para el modelo del Space propio. */
export const CONTRATO_DSL = `## Cómo responder en este turno

Devuelve SIEMPRE un único objeto JSON válido, sin markdown ni texto antes o después.

{
  "tipo": "diagrama" | "consulta" | "chat",
  "mensaje": "texto breve para la persona",
  "entidades": [
    {
      "id": "n1",
      "tipo": "class" | "abstract" | "interface" | "enumeration",
      "nombre": "Pedido",
      "atributos": [
        { "visibilidad": "private", "nombre": "total", "tipo": "double", "multiplicidad": "1" }
      ],
      "metodos": [
        { "visibilidad": "public", "nombre": "calcularTotal", "parametros": [], "retorno": "double" }
      ],
      "literales": ["PENDIENTE", "CONFIRMADA"]
    }
  ],
  "relaciones": [
    {
      "id": "e1",
      "origen": "n1",
      "destino": "n2",
      "tipo": "association" | "aggregation" | "composition" | "inheritance" | "implementation" | "dependency",
      "origenMult": "1",
      "destinoMult": "0..*",
      "etiqueta": "contiene"
    }
  ],
  "consultas": [
    { "herramienta": "consultarHistorial", "args": { "entidad": "Pedido" } }
  ]
}

Reglas obligatorias:
- Para editar, devuelve el diagrama COMPLETO: todas las entidades y todas las relaciones, no solo las que cambian.
- Conserva los "id" de entidades y relaciones que ya existen. Usa ids nuevos y únicos para lo nuevo.
- Conserva también el "tipo" de cada entidad y relación existente; solo cámbialo si la persona lo pide.
- Los extremos de una relación usan el "id" de la entidad, nunca su nombre.
- No elimines entidades, relaciones, atributos, métodos ni literales salvo que la persona lo pida explícitamente (eliminar, quitar, borrar, reemplazar).
- Si no hay cambios que hacer, devuelve el mismo diagrama que recibiste.
- Si solo te hacen una pregunta, usa "tipo": "chat" y responde en "mensaje".
- Si necesitas historial, plan, estado o validación antes de editar, usa "tipo": "consulta" con "consultas". Herramientas permitidas: consultarHistorial, consultarPlan, getState, validate.
- No inventes entidades ni relaciones que no estén en el estado actual.

Ejemplo de edición (agregar una clase y conectarla):
{"tipo":"diagrama","mensaje":"Agregué Cliente y su relación con Pedido.","entidades":[{"id":"n1","tipo":"class","nombre":"Pedido","atributos":[{"visibilidad":"private","nombre":"total","tipo":"double"}]},{"id":"n2","tipo":"class","nombre":"Cliente","atributos":[{"visibilidad":"private","nombre":"nombre","tipo":"string"}]}],"relaciones":[{"id":"e1","origen":"n2","destino":"n1","tipo":"association","origenMult":"1","destinoMult":"0..*","etiqueta":"realiza"}]}`;

/** Bloque de estado canónico que se anexa al final del system prompt. */
export function bloqueEstado(diagrama: DiagramaCanonico): string {
  return `## Estado canónico del diagrama

Esta es la única fuente de verdad. Usa estos ids exactos al devolver el diagrama.

${JSON.stringify(diagrama)}`;
}

/** Normaliza un mensaje `tool` o un assistant con tool_calls. */
function normalizarMensaje(mensaje: IAChatMessage): MensajeDsl {
  if (mensaje.role === "tool") {
    const nombre = mensaje.name ? ` de ${mensaje.name}` : "";
    return {
      role: "user",
      content: `Resultado de la herramienta${nombre}:\n${mensaje.content ?? ""}`,
    };
  }

  if (mensaje.role === "assistant") {
    if (
      (!mensaje.content || mensaje.content.trim() === "") &&
      Array.isArray(mensaje.tool_calls) &&
      mensaje.tool_calls.length > 0
    ) {
      const nombres = mensaje.tool_calls
        .map((llamada) => llamada.function?.name ?? "herramienta")
        .join(", ");
      return { role: "assistant", content: `Solicité las herramientas: ${nombres}.` };
    }
    return { role: "assistant", content: mensaje.content ?? "" };
  }

  if (mensaje.role === "system") {
    return { role: "system", content: mensaje.content ?? "" };
  }

  return { role: "user", content: mensaje.content ?? "" };
}

/**
 * Construye los mensajes para el Space propio: reemplaza el snapshot por la
 * proyección canónica y añade el contrato. No muta los mensajes originales.
 */
export function construirMensajesDsl(
  mensajes: IAChatMessage[],
  diagrama: DiagramaCanonico,
): MensajeDsl[] {
  const normalizados = mensajes.map(normalizarMensaje);
  const indiceSistema = normalizados.findIndex((mensaje) => mensaje.role === "system");
  const sufijo = `\n\n${CONTRATO_DSL}\n\n${bloqueEstado(diagrama)}`;

  if (indiceSistema === -1) {
    return [{ role: "system", content: `Eres el asistente del diagramador UML.${sufijo}` }, ...normalizados];
  }

  return normalizados.map((mensaje, indice) =>
    indice === indiceSistema
      ? { ...mensaje, content: `${quitarSeccionEstado(mensaje.content)}${sufijo}` }
      : mensaje,
  );
}

/** `true` si la última instrucción de la persona autoriza borrar/reemplazar. */
export function pedirBorrado(mensajes: IAChatMessage[]): boolean {
  for (let i = mensajes.length - 1; i >= 0; i -= 1) {
    const mensaje = mensajes[i];
    if (mensaje.role !== "user") continue;
    const texto = (mensaje.content ?? "").toLowerCase();

    // Si la instrucción niega el borrado, no se autoriza aunque mencione el verbo.
    const negado =
      /(?:^|[^\p{L}])(?:no|sin|nunca|jamás|jamas)(?:\s+[\p{L}]+){0,4}\s+(?:elimin|borr|quit|remuev|remov|suprim|reemplaz|sustitu)\p{L}*/iu.test(
        texto,
      );
    if (negado) return false;

    return /(elimin|borr|quit|remuev|remov|suprim|reemplaz|sustitu|delete|remove|replace)/i.test(
      texto,
    );
  }
  return false;
}
