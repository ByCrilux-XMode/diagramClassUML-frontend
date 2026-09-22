import { NextRequest } from "next/server";
import type { IAChatMessage } from "@/lib/ia/types";
import { getAdapter } from "@/lib/ia/adapters";
import { IA_HELP_MODEL } from "@/lib/ia/config";
import {
  buildHelpSystemPrompt,
  parseHelpJson,
  type HelpProjectItem,
} from "@/lib/ia/helpPrompt";

/**
 * POST /api/ia/help
 * Chat del asistente de /proyectos. Usa OpenRouter (con fallback de hasta 3
 * keys) y devuelve un objeto de intención + texto en español que el cliente
 * ejecuta (abrir modal, descargar backend en esa misma página, etc.).
 *
 * Body: { messages: IAChatMessage[], projects?: [{ proyectoId, nombre }] }
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido." }, { status: 400 });
  }

  const raw = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const messages = raw.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "Falta el campo 'messages'." }, { status: 400 });
  }

  // Sanitizar proyectos: solo id + nombre, sin exponer nada sensible.
  const projects: HelpProjectItem[] = Array.isArray(raw.projects)
    ? raw.projects
        .filter(
          (p): p is { proyectoId: unknown; nombre: unknown } =>
            typeof p === "object" && p !== null
        )
        .map((p) => ({
          proyectoId: Number(p.proyectoId),
          nombre: String(p.nombre ?? "").trim(),
        }))
        .filter((p) => Number.isFinite(p.proyectoId) && p.nombre.length > 0)
        .slice(0, 60)
    : [];

  const system: IAChatMessage = {
    role: "system",
    content: buildHelpSystemPrompt(projects),
  };
  const userMessages = (messages as IAChatMessage[]).slice(-8);

  // Fallback por modelo: prueba tus 3 de .env en orden si uno es agentic-only (403), 401 o devuelve safety
  const { OPENROUTER_MODELS } = await import("@/lib/ia/config");
  const candidates = OPENROUTER_MODELS.length > 0 ? OPENROUTER_MODELS : [IA_HELP_MODEL].filter(Boolean);
  let lastErr: unknown = null;
  for (const m of candidates) {
    try {
      const result = await getAdapter("openrouter").chat({
        provider: "openrouter",
        model: m,
        messages: [system, ...userMessages],
        tools: [],
        httpReferer: new URL(request.url).origin,
      });
      // Si el modelo devuelve safety filter, trátalo como error y prueba el siguiente
      if (result.content.trim() === "User Safety: safe" || result.content.includes("User Safety")) {
        throw new Error("Modelo devolvió filtro de seguridad (User Safety: safe), probando siguiente modelo");
      }
      const parsed = parseHelpJson(result.content);
      return Response.json({
        ...parsed,
        model: result.model,
        keyFallbacksUsed: result.keyFallbacksUsed ?? 0,
      });
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!/not a valid model ID|401|403|429|Missing Authentication|agentic harnesses|User Safety/i.test(msg)) {
        console.error("[api/ia/help]", msg);
        return Response.json({ error: msg || "El asistente online no está disponible." }, { status: 502 });
      }
      // 403 agentic-only o safety -> prueba siguiente modelo
    }
  }
  const message = lastErr instanceof Error ? lastErr.message : String(lastErr ?? "El asistente online no está disponible.");
  console.error("[api/ia/help]", message);
  return Response.json({ error: message }, { status: 502 });
}