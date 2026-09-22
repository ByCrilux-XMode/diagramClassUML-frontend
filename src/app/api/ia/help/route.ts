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

  try {
    const result = await getAdapter("openrouter").chat({
      provider: "openrouter",
      model: IA_HELP_MODEL,
      messages: [system, ...userMessages],
      tools: [],
    });
    const parsed = parseHelpJson(result.content);
    return Response.json({
      ...parsed,
      model: result.model,
      keyFallbacksUsed: result.keyFallbacksUsed ?? 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ia/help]", message);
    return Response.json(
      { error: message || "El asistente online no está disponible." },
      { status: 502 }
    );
  }
}