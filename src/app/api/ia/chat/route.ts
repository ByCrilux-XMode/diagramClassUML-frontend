import { NextRequest } from "next/server";
import type { IAChatMessage, IAProvider, IAToolDef } from "@/lib/ia/types";
import { getAdapter, isValidProvider } from "@/lib/ia/adapters";
import { guardiaIA } from "@/lib/ia/guardia";
import { IA_DEFAULT_MODEL, OPENROUTER_DEFAULT_MODEL } from "@/lib/ia/config";

/**
 * Modelo que se manda al proveedor. El navegador solo ve las claves
 * `NEXT_PUBLIC_*`, así que puede llegar vacío o con un identificador de otro
 * proveedor (p. ej. un tag de Ollama `qwen2.5-coder:7b` a OpenRouter, que
 * responde HTTP 400). Aquí se resuelve con la configuración del servidor.
 */
function resolverModelo(provider: IAProvider, solicitado: string): string {
  const modelo = solicitado.trim();
  if (provider === "openrouter") {
    // Los IDs de OpenRouter siempre son `organizacion/modelo`.
    if (modelo === "" || !modelo.includes("/")) return OPENROUTER_DEFAULT_MODEL;
    return modelo;
  }
  if (provider === "huggingface") {
    // Igual que arriba: Hugging Face espera `organizacion/modelo`.
    if (modelo === "" || !modelo.includes("/")) return IA_DEFAULT_MODEL;
    return modelo;
  }
  // hf-space y ollama ignoran el nombre del modelo: basta con no mandarlo vacío.
  return modelo || IA_DEFAULT_MODEL;
}

export async function POST(request: NextRequest) {
  // Fase 9: la sesión y el límite se resuelven antes de leer el cuerpo.
  const guardia = await guardiaIA(request, "chat");
  if (!guardia.ok) return guardia.respuesta;

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
  const model = typeof raw.model === "string" ? resolverModelo(provider as IAProvider, raw.model) : "";
  if (model === "") {
    return Response.json(
      { error: "Falta el campo 'model' y el proveedor no tiene un modelo por defecto configurado." },
      { status: 400 },
    );
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
      model,
      messages: messages as IAChatMessage[],
      tools,
      httpReferer: new URL(request.url).origin,
    });
    return Response.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/ia/chat]", provider, `usuario=${guardia.usuario.usuarioId}`, message);
    return Response.json({ error: message }, { status: 502 });
  }
}