import type { DiagramState } from "@/lib/editorTools";

export const SYSTEM_PROMPT = `Eres el asistente del diagramador UML. Usa tool_calls en formato JSON: las de escritura solo en modo build dentro del ámbito grupal; en cualquier otro caso dispones únicamente de las de lectura.

Reglas de contexto:
- El estado actual del diagrama que aparece abajo es la única fuente de verdad.
- Si el historial menciona una clase o relación que no está en ese estado, ya no existe: no la edites como si existiera. Usa getState si necesitas confirmarlo.
- El historial sirve para entender a qué se refiere el usuario, no para suponer el contenido actual del diagrama.`;

/**
 * Prompt del turno: instrucciones base + snapshot compacto del diagrama.
 * El snapshot evita que el modelo tenga que adivinar qué clases y relaciones
 * existen; `getState` sigue disponible para refrescar a mitad de turno.
 */
export function buildSystemPrompt(state?: DiagramState): string {
  if (!state || (state.classes.length === 0 && state.links.length === 0)) {
    return `${SYSTEM_PROMPT}\n\nEl diagrama está vacío.`;
  }
  return `${SYSTEM_PROMPT}\n\nEstado actual del diagrama (JSON compacto; usa estas claves exactas al referirte a clases o relaciones):\n${JSON.stringify(state)}`;
}
