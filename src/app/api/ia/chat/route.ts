import { NextRequest } from "next/server";
import type { IAChatMessage, IAProvider, IAToolDef } from "@/lib/ia/types";
import { getAdapter, isValidProvider } from "@/lib/ia/adapters";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "El cuerpo debe ser JSON válido." }, { status: 400 });
  }

  const raw = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const provider = raw.provider;
  if (!isValidProvider(provider)) {
    return Response.json(
      { error: "Provider inválido: usa 'ollama', 'hf-space', 'huggingface' u 'openrouter'." },
      { status: 400 }
    );
  }
  const model = raw.model;
  if (typeof model !== "string" || model.trim() === "") {
    return Response.json({ error: "Falta el campo 'model'." }, { status: 400 });
  }
  const messages = raw.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "Falta el campo 'messages'." }, { status: 400 });
  }
  const tools = Array.isArray(raw.tools) ? (raw.tools as IAToolDef[]) : [];

  const adapter = getAdapter(provider as IAProvider);
  try {
    const result = await adapter.chat({
      provider: provider as IAProvider,
      model: model.trim(),
      messages: messages as IAChatMessage[],
      tools,
    });
    return Response.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ia/chat]", provider, message);
    return Response.json({ error: message }, { status: 502 });
  }
}