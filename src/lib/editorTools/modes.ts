/**
 * Candado de capacidades de la IA: ejes ámbito / modo / rol.
 *
 * Fuente única de verdad de qué herramientas se le ofrecen al modelo en un
 * turno. El prompt es una sugerencia; esto es la regla. Ver D36–D39 del
 * cambio 06-modos-plan-build.
 *
 *   puedeEditar = ambito === "grupo" && modo === "build" && rol ∈ {CREADOR, EDITOR}
 *
 * No importa nada de aquí a `localStorage` ni a la base de datos: es puro
 * cálculo sobre el estado del turno. La persistencia de la preferencia de modo
 * vive en el store del chat.
 */
import type { RolProyecto } from "@/types/proyecto";
import type { ToolSchemaEntry } from "./tools";
import { buildOllamaToolDefs, isReadOnlyTool } from "./tools";

/** Quién ve la conversación. El ámbito privado nunca edita. */
export type AmbitoIA = "grupo" | "privado";

/** Qué puede hacer la IA en el turno. Solo una persona lo mueve. */
export type ModoIA = "plan" | "build";

export interface ContextoModo {
  ambito: AmbitoIA;
  modo: ModoIA;
  rol: RolProyecto | null;
}

/** Tool en el formato que el proxy envía al proveedor. */
export interface ToolOffer {
  type: "function";
  function: ToolSchemaEntry;
}

/** El modo efectivo de un turno: en privado siempre es `plan`. */
export function modoEfectivo({ ambito, modo }: Pick<ContextoModo, "ambito" | "modo">): ModoIA {
  return ambito === "privado" ? "plan" : modo;
}

/**
 * Único punto que decide si la IA puede proponer ediciones en un turno.
 * Un LECTOR nunca califica, en ningún ámbito ni modo.
 */
export function esEditable({ ambito, modo, rol }: ContextoModo): boolean {
  if (ambito !== "grupo") return false;
  if (modoEfectivo({ ambito, modo }) !== "build") return false;
  return rol === "CREADOR" || rol === "EDITOR";
}

/**
 * Set de herramientas ofrecido al modelo para un turno.
 *
 * - `grupo | build | CREADOR/EDITOR` → todas (las de escritura llegan como
 *   propuestas HITL).
 * - Cualquier otra combinación → solo lectura. La fila `grupo | build | LECTOR`
 *   degrada en lugar de devolver una lista vacía: un LECTOR consulta, no queda
 *   mudo.
 */
export function toolsForMode(contexto: ContextoModo): ToolOffer[] {
  const todas = buildOllamaToolDefs();
  if (esEditable(contexto)) return todas;
  return todas.filter((tool) => isReadOnlyTool(tool.function.name));
}

/** Errores que el loop devuelve al modelo cuando rechaza una herramienta. */
export const MOTIVO_NO_OFRECIDA = "Herramienta no disponible en este turno.";

export function motivoSinEdicion(modo: ModoIA): string {
  return `Herramienta no disponible en modo ${modo}: la IA solo edita en modo build dentro del ámbito grupo, con rol CREADOR o EDITOR.`;
}
