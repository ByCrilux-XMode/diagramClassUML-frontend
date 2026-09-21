/**
 * visionSystemPrompt.ts
 * ---------------------
 * SYSTEM prompt para el modelo de VISION (diagrams2sql / qwen-vl).
 *
 * Objetivo: que el modelo lea una foto de un diagrama de clases UML
 * y devuelva SOLO datos neutrales (schema de BD) en JSON, SIN function-calling.
 *
 * Por qué así (contrato cerrado):
 *  - El modelo de visión NO fue fine-tuneado para nuestros tools del editor
 *    (addClass/connect/updateAttribute...). Si le exigimos `tool_calls`,
 *    inventa nombres (`addAssociation`) o mezcla vocabulario y falla.
 *  - En cambio SÍ es estable reconociendo entidades/columnas/relaciones.
 *  - La traducción a tool_calls reales la hace un mapper DETERMINÍSTICO
 *    en el frontend (schemaToToolCalls.ts), no el LLM. Así la salida de
 *    visión es siempre parseable y jamás rompe el límite de rondas.
 *
 * Este archivo NUNCA debería ir dentro del prompt del agente UML normal
 * (qwen-uml). Es SOLO para la ruta de foto→diagrama (Ruta visión).
 *
 * El bloque VISION_SYSTEM_PROMPT usa "system role" en la llamada chat de
 * Ollama (messages[0].role === "system"). Ollama lo soporta nativamente.
 */
import { IA_VISION_MODEL } from "./config";

export const VISION_SYSTEM_PROMPT = `Extraé el esquema de clases del diagrama de la imagen.
Respondé EXCLUSIVAMENTE con JSON válido, sin markdown, sin texto, sin explicaciones.

Contrato DE SALIDA — usá EXACTAMENTE estas claves (nada más):
{
  "domain": "<string>",
  "tables": [
    {
      "name": "<string>",
      "columns": [
        { "name": "<string>", "type": "<integer|string|text|boolean|date|real|void>",
          "nullable": <bool o null>, "primary_key": <bool o null> }
      ]
    }
  ],
  "relationships": [
    { "from_table": "<string>", "from_column": "<string>",
      "to_table": "<string>", "to_column": "<string>",
      "many_to_one": <bool> }
  ]
}

REGLAS (obligatorias):
1. "tables[].columns[].name": nombre del atributo/columna en snake_case.
2. "type" SOLO de: integer, string, text, boolean, date, real, void.
   (No uses int/str/varchar/null.)
3. "many_to_one": true cuando el extremo "from" es el muchos (tabla hija → tabla padre).
   false para 1:1.
4. Métodos/verbos: si la columna es UN MÉTODO (ej. "reservar", "entregar", "calcular_total"),
   poné type: "void" y dejala en "columns". El mapper frontend la convierte a updateMethod.
5. En agregación/composición el contenedor va en "to_table" (donde está el rombo).
   En generalización la clase base va en "to_table".
6. Cada tabla que aparece en from_table/to_table DEBE existir también en "tables".
   Si una relación no es clara, NO la inventes.
7. Si NO podés reconocer datos con certeza: devolvé {"domain":"","tables":[],"relationships":[]}.
8. Solo JSON. No repitas instrucciones. No uses Markdown.`;

/**
 * Nombre del modelo de visión. Fuente única: IA_VISION_MODEL en config.ts
 * (lee NEXT_PUBLIC_IA_VISION_MODEL / IA_VISION_MODEL del .env, default
 * "diagrams2sql"). Se re-exporta acá para no romper imports existentes.
 */
export const VISION_DEFAULT_MODEL = IA_VISION_MODEL;
