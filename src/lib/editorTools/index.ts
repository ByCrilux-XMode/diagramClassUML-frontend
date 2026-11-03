/**
 * API pública del editor de diagramas.
 *
 * Las tools viven en `./tools` (una por archivo) y se agregan en
 * `./tools/index.ts`. Este módulo solo expone la superficie estable que
 * consumen el loop de IA, el ghost preview y la UI.
 */
export {
  TOOLS,
  TOOL_BY_NAME,
  TOOL_SCHEMAS,
  KNOWN_TOOL_NAMES,
  VISUAL_TOOL_NAMES,
  READ_ONLY_TOOL_NAMES,
  buildOllamaToolDefs,
  executeTool,
  executeToolSync,
  esPromesa,
  isReadOnlyTool,
  isVisualTool,
  validateArgs,
} from "./tools";
export type { AnyTool, ToolArgs, ToolName, ToolSchemaEntry } from "./tools";
export {
  MOTIVO_NO_OFRECIDA,
  esEditable,
  modoEfectivo,
  motivoSinEdicion,
  toolsForMode,
} from "./modes";
export type { AmbitoIA, ContextoModo, ModoIA, ToolOffer } from "./modes";
export {
  SNAPSHOT_MAX_CLASSES,
  readDiagramSnapshot,
  serializeDiagramState,
} from "./state";
export type {
  DiagramClassState,
  DiagramLinkState,
  DiagramState,
  SerializeStateOptions,
} from "./state";
export type {
  JsonSchemaObject,
  ToolBehavior,
  ToolContext,
  ToolDef,
  ToolResult,
  ValidationResult,
} from "./define";
export { registerDiagram, unregisterDiagram, getDiagram } from "./graphStore";
