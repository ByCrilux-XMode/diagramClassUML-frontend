import {
  KNOWN_TOOL_NAMES,
  MOTIVO_NO_OFRECIDA,
  esEditable,
  executeTool,
  executeToolSync,
  getDiagram,
  isReadOnlyTool,
  modoEfectivo,
  motivoSinEdicion,
  toolsForMode,
  validateArgs,
} from "@/lib/editorTools";
import type { AmbitoIA, ContextoModo, ModoIA, ToolArgs, ToolName } from "@/lib/editorTools";
import type { RolProyecto } from "@/types/proyecto";
import { IA_MAX_TOOL_ROUNDS } from "./config";
import { applyGridLayout } from "@/lib/go/autoLayout";
import { withAiOrigin } from "@/lib/actividad/origen";
import type { OrigenIA } from "@/lib/actividad/origen";
import { perfilDeProveedor } from "./providers";
import { chatConFallback } from "./fallback";
import type { EventoIntento } from "./fallback";
import type { FallbackRegistrado, TramoProveedor } from "./router";
import { logContexto, recortarMensajes } from "./context/budget";
import type { ResultadoRecorte } from "./context/budget";
import type {
  AgentResult,
  CapaContexto,
  ContextoInfo,
  FallbackIA,
  IAChatMessage,
  IAProvider,
  IAToolCall,
  PendingProposal,
  PersonaIA,
  TurnTrace,
} from "./types";

export interface AgentLoopParams {
  /** Cadena resuelta del turno, con el proveedor preferido primero (D55/D59). */
  cadena: TramoProveedor[];
  systemPrompt: string;
  userMessage: string;
  history?: IAChatMessage[];
  maxRounds?: number;
  onTurn?: (turn: TurnTrace) => void;
  /** Un evento por intento de proveedor; sirve para el diagnóstico y la UI. */
  onIntento?: (evento: EventoIntento) => void;
  /** Abort provocado por la persona: corta el turno sin fallback. */
  signal?: AbortSignal;
  /**
   * Proponer en lugar de ejecutar. Si no se pasa se deriva del modo: en
   * `build` con rol de edición se propone (HITL); en `plan` no hace falta
   * porque el set ya es de solo lectura.
   */
  hitl?: boolean;
  images?: string[];
  /** Quién ve la conversación. Por defecto, `grupo`. */
  ambito?: AmbitoIA;
  /** Modo del turno. Por defecto, `plan`. */
  modo?: ModoIA;
  /** Rol de quien dispara el turno. `null` o LECTOR nunca editan. */
  rol?: RolProyecto | null;
  /** Contexto de atribución para los cambios que ejecuten las tools. */
  turnoId?: string;
  solicitadoPor?: PersonaIA;
  proyectoId?: string | null;
  /** Tokens y recortes por capa que armó el builder. */
  contextoCapas?: CapaContexto[];
  /** Fuentes que el loader no pudo traer; se informan en el resultado. */
  contextoDegradado?: string[];
}

function safeParseArgs(args: string | undefined | Record<string, unknown>): unknown {
  if (args === undefined || args === null) return {};
  if (typeof args === "object") return args;
  try {
    return JSON.parse(args);
  } catch {
    return {};
  }
}

function toolResultJson(ok: boolean, data: Record<string, unknown> | undefined, message: string | undefined, error?: string): string {
  if (ok) {
    return JSON.stringify({ ok: true, ...(data ?? {}), ...(message ? { message } : {}) });
  }
  return JSON.stringify({ ok: false, error: error ?? "La herramienta falló." });
}

export function extractToolCallsFromContent(content: string): IAToolCall[] {
  if (!content || typeof content !== "string") return [];
  const calls: IAToolCall[] = [];
  // También soporta <tool_call>...</tool_call>
  const unwrapped = content.replace(/<tool_call>/gi, " ").replace(/<\/tool_call>/gi, " ");
  let idx = 0;
  while (idx < unwrapped.length) {
    const start = unwrapped.indexOf('{"name"', idx);
    const start2 = unwrapped.indexOf("{'name'", idx);
    // también {"name" : sin envolver con comillas simples no nos interesa
    let pos = -1;
    if (start !== -1 && start2 !== -1) pos = Math.min(start, start2);
    else pos = start !== -1 ? start : start2;
    if (pos === -1) {
      // fallback: busca "name" suelto sin envolver
      const alt = unwrapped.indexOf('"name"', idx);
      if (alt === -1) break;
      // intenta encontrar el '{' que abre el objeto
      const braceStart = unwrapped.lastIndexOf("{", alt);
      if (braceStart === -1 || braceStart < idx) {
        idx = alt + 6;
        continue;
      }
      pos = braceStart;
    }
    let depth = 0;
    let end = -1;
    for (let i = pos; i < unwrapped.length; i++) {
      const ch = unwrapped[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break;
    const slice = unwrapped.slice(pos, end + 1);
    try {
      const parsed = JSON.parse(slice) as { name?: string; arguments?: unknown };
      if (typeof parsed.name === "string" && KNOWN_TOOL_NAMES.has(parsed.name)) {
        let args: Record<string, unknown> = {};
        if (parsed.arguments && typeof parsed.arguments === "object" && !Array.isArray(parsed.arguments)) {
          args = parsed.arguments as Record<string, unknown>;
        } else if (typeof parsed.arguments === "string" && parsed.arguments.trim() !== "") {
          try {
            const inner = JSON.parse(parsed.arguments) as unknown;
            if (inner && typeof inner === "object" && !Array.isArray(inner)) args = inner as Record<string, unknown>;
            else if (typeof inner === "string") args = { value: inner };
          } catch {
            // string no es JSON, ignora y deja args vacío para que validate falle con mensaje claro
          }
        }
        calls.push({
          id: `fallback-${Date.now()}-${calls.length}`,
          type: "function",
          function: { name: parsed.name, arguments: JSON.stringify(args) },
        });
      }
    } catch {
      // no es JSON válido, ignora y avanza
    }
    idx = end + 1;
  }
  return calls;
}

export async function runAgentLoop(params: AgentLoopParams): Promise<AgentResult> {
  const maxRounds = Math.max(1, params.maxRounds ?? IA_MAX_TOOL_ROUNDS);
  const userImages = params.images && params.images.length > 0 ? params.images : undefined;
  // D37: un solo punto decide qué se le ofrece al modelo.
  const contextoModo: ContextoModo = {
    ambito: params.ambito ?? "grupo",
    modo: params.modo ?? "plan",
    rol: params.rol ?? null,
  };
  const tools = toolsForMode(contextoModo);
  // D36: el candado de escritura. No depende del set ofrecido: aunque una tool
  // llegue por el parser de fallback, si el turno no es editable no se ejecuta
  // ni se propone.
  const editable = esEditable(contextoModo);
  const modoTurno = modoEfectivo(contextoModo);
  let origenActividad: OrigenIA | null =
    params.turnoId && params.solicitadoPor
      ? {
          turnoId: params.turnoId,
          modelo: "",
          solicitadoPor: params.solicitadoPor,
          proyectoId: params.proyectoId ?? null,
        }
      : null;
  let messages: IAChatMessage[] = [
    { role: "system", content: params.systemPrompt },
    ...(params.history ?? []),
    { role: "user", content: params.userMessage, ...(userImages ? { images: userImages } : {}) },
  ];
  const trace: TurnTrace[] = [];
  const pendingProposals: PendingProposal[] = [];
  const hitl = params.hitl ?? editable;
  let lastContent = "";
  let bloquesEliminados = 0;
  let truncados = 0;
  let ultimoRecorte: ResultadoRecorte | null = null;
  let proveedorUsado: IAProvider | undefined;
  let modeloUsado: string | undefined;
  const fallbacks: FallbackRegistrado[] = [];

  const resultadoBase = () => ({
    trace,
    pendingProposals: pendingProposals.length > 0 ? pendingProposals : undefined,
    hitlRequired: pendingProposals.length > 0,
    contexto: contexto(),
    proveedorUsado,
    modeloUsado,
    fallbacks: fallbacks.length > 0 ? (fallbacks as FallbackIA[]) : undefined,
  });

  const contexto = (): ContextoInfo | undefined => {
    const capas = params.contextoCapas;
    const degradado = params.contextoDegradado;
    if (!ultimoRecorte && !capas && !degradado) return undefined;
    return {
      bloquesEliminados,
      truncados,
      tokensEstimados: ultimoRecorte?.tokensEstimados ?? 0,
      presupuestoEntrada: ultimoRecorte?.presupuesto.entrada ?? 0,
      ventana: ultimoRecorte?.presupuesto.ventana ?? 0,
      aviso:
        ultimoRecorte && ultimoRecorte.presupuesto.disponible <= 0
          ? "El system prompt y las herramientas ya consumen todo el presupuesto; no se recortó el system."
          : undefined,
      capas,
      degradado: degradado && degradado.length > 0 ? degradado : undefined,
    };
  };

  for (let round = 0; round < maxRounds; round++) {
    // D57: el presupuesto se recalcula por intento, con el perfil del tramo.
    // Un payload que cabe en OpenRouter puede no caber en HF Space.
    const intento = await chatConFallback<ResultadoRecorte>({
      cadena: params.cadena,
      signal: params.signal,
      onIntento: params.onIntento,
      preparar: (tramo) => {
        const recorte = recortarMensajes({
          messages,
          tools,
          systemPrompt: params.systemPrompt,
          perfil: perfilDeProveedor(tramo.proveedor),
        });
        return { messages: recorte.messages, tools, contexto: recorte };
      },
    });

    // El turno continúa con el recorte del tramo que respondió.
    messages = intento.intento.messages;
    const recorte = intento.intento.contexto;
    if (recorte) {
      bloquesEliminados += recorte.eliminados;
      truncados += recorte.truncados;
      ultimoRecorte = recorte;
      logContexto("turno", recorte, round);
    }
    proveedorUsado = intento.proveedorUsado;
    modeloUsado = intento.modeloUsado;
    fallbacks.push(...intento.fallbacks);
    if (origenActividad) origenActividad = { ...origenActividad, modelo: intento.modeloUsado };

    lastContent = intento.content ?? "";

    let toolCalls: IAToolCall[] = Array.isArray(intento.toolCalls) ? intento.toolCalls : [];
    if (toolCalls.length === 0) {
      const fallback = extractToolCallsFromContent(intento.content ?? "");
      if (fallback.length > 0) toolCalls = fallback;
    }
    if (toolCalls.length === 0) {
      return {
        ...resultadoBase(),
        finalContent: intento.content,
      };
    }

    messages.push({
      role: "assistant",
      content: intento.content ?? "",
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const name = call.function?.name ?? "";
      // Candado 1: solo las herramientas ofrecidas en este turno.
      const ofrecida = tools.some((tool) => tool.function.name === name);
      // Candado 2: sin modo build no hay escritura, venga de donde venga.
      const escrituraBloqueada = !editable && !isReadOnlyTool(name);
      if (!ofrecida || escrituraBloqueada) {
        const motivo = escrituraBloqueada ? motivoSinEdicion(modoTurno) : MOTIVO_NO_OFRECIDA;
        trace.push({ round, toolName: name, ok: false, error: motivo });
        params.onTurn?.(trace[trace.length - 1]);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name,
          content: toolResultJson(false, undefined, undefined, motivo),
        });
        continue;
      }
      const parsed = safeParseArgs(call.function?.arguments);
      const validation = validateArgs(name as ToolName, parsed);

      if (!validation || !validation.ok) {
        const errorMsg =
          validation && !validation.ok
            ? validation.error
            : `Tool desconocido: '${name}'.`;
        trace.push({ round, toolName: name, ok: false, error: errorMsg });
        params.onTurn?.(trace[trace.length - 1]);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name,
          content: toolResultJson(false, undefined, undefined, errorMsg),
        });
        continue;
      }
      // HITL: las tools de solo lectura (getState, validate) se ejecutan siempre.
      if (hitl && !isReadOnlyTool(name)) {
        // HITL: no ejecuta, solo propone. Guarda para aprobación humana.
        pendingProposals.push({
          id: call.id,
          toolName: name,
          args: validation.value as unknown as Record<string, unknown>,
          round,
          turnoId: params.turnoId,
          proveedor: proveedorUsado,
          modelo: modeloUsado,
          solicitadoPor: params.solicitadoPor,
          proyectoId: params.proyectoId ?? null,
        });
        trace.push({ round, toolName: name, ok: true });
        params.onTurn?.(trace[trace.length - 1]);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name,
          content: JSON.stringify({ ok: true, proposed: true, tool: name }),
        });
        continue;
      }
      let result: ToolResultLike;
      try {
        const ctx = { proyectoId: params.proyectoId ?? null };
        if (isReadOnlyTool(name)) {
          // D46: las consultas pueden ser asíncronas y se esperan fuera de
          // `withAiOrigin`. No tocan GoJS, así que no hay transacción humana
          // que pueda heredar el origen de la IA durante el `await`.
          result = await executeTool(name as ToolName, validation.value as ToolArgs, ctx);
        } else {
          // Las escrituras siguen siendo síncronas: el flag se abre y se cierra
          // alrededor de una llamada sin `await`. No introducir `await` aquí.
          const ejecutar = () => executeToolSync(name as ToolName, validation.value as ToolArgs, ctx);
          result = origenActividad ? withAiOrigin(origenActividad, ejecutar) : ejecutar();
        }
      } catch (err: unknown) {
        result = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
      trace.push({
        round,
        toolName: name,
        ok: result.ok,
        error: result.ok ? undefined : result.error,
      });
      params.onTurn?.(trace[trace.length - 1]);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name,
        content: toolResultJson(result.ok, result.data, result.message, result.error),
      });
    }
  }

  return {
    ...resultadoBase(),
    finalContent:
      pendingProposals.length > 0
        ? lastContent.trim() || "Propuesta lista para revisión humana."
        : "Se alcanzó el límite de rondas de herramientas y el modelo no entregó una respuesta final. Revisa el trace de abajo o reformula tu pedido.",
  };
}

export function applyPendingProposals(pending: PendingProposal[]): {
  trace: TurnTrace[];
  applied: number;
  errors: string[];
} {
  const trace: TurnTrace[] = [];
  const errors: string[] = [];
  let applied = 0;
  for (const p of pending) {
    const validation = validateArgs(p.toolName as ToolName, p.args);
    if (!validation || !validation.ok) {
      const msg = validation && !validation.ok ? validation.error : `Tool desconocido: '${p.toolName}'.`;
      trace.push({ round: p.round, toolName: p.toolName, ok: false, error: msg });
      errors.push(msg);
      continue;
    }
    try {
      const result = executeToolSync(p.toolName as ToolName, validation.value as ToolArgs, {
        proyectoId: p.proyectoId ?? null,
      });
      trace.push({ round: p.round, toolName: p.toolName, ok: result.ok, error: result.ok ? undefined : result.error });
      if (result.ok) applied++;
      else if (result.error) errors.push(result.error);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      trace.push({ round: p.round, toolName: p.toolName, ok: false, error: msg });
      errors.push(msg);
    }
  }
  const hasAddClass = pending.some((p) => p.toolName === "addClass");
  const hasIADecidedLoc = pending.some((p) => p.toolName === "addClass" && typeof (p.args as Record<string, unknown>).loc === "string" && String((p.args as Record<string, unknown>).loc).trim() !== "");
  if (hasAddClass && applied > 1 && !hasIADecidedLoc) {
    try {
      applyGridLayout(getDiagram());
    } catch {
      // layout opcional, no bloquea el flujo HITL
    }
  }
  return { trace, applied, errors };
}

interface ToolResultLike {
  ok: boolean;
  error?: string;
  message?: string;
  data?: Record<string, unknown>;
}