import { describe, expect, it } from "vitest";
import { chat as chatHF } from "@/lib/ia/adapters/hfSpace";
import { chat as chatOpenRouter } from "@/lib/ia/adapters/openrouter";
import { buildToolDefs } from "@/lib/ia/buildToolDefs";
import { buildSystemPrompt } from "@/lib/ia/prompt";
import type { IAChatResponse } from "@/lib/ia/types";
import { TOOL_BY_NAME } from "@/lib/editorTools";

const vivo = process.env.IA_VIVO === "1";
const timeout = 240_000;

const system = buildSystemPrompt();
const tools = buildToolDefs();
const nombres = tools.map((t) => t.function.name);

const protocolo = `\n\nFORMATO OBLIGATORIO DE RESPUESTA:
Cuando necesites ejecutar una herramienta, responde ÚNICAMENTE con este JSON, sin markdown ni explicaciones:
{"tool_calls":[{"function":{"name":"<herramienta>","arguments":{...}}}]}
Herramientas disponibles: ${nombres.join(", ")}.`;

const usuario =
  "Crea la clase Pedido con el atributo total: double. Crea también la clase Cliente y una asociación de Pedido hacia Cliente con 1 a 0..*.";

async function conReintentos(fn: () => Promise<IAChatResponse>, etiqueta: string) {
  let ultimo: unknown = null;
  for (let intento = 1; intento <= 3; intento += 1) {
    try {
      return await fn();
    } catch (err) {
      ultimo = err;
      console.log(`${etiqueta} intento ${intento}:`, err instanceof Error ? err.message.slice(0, 120) : err);
      await new Promise((s) => setTimeout(s, 8000));
    }
  }
  throw ultimo;
}

function validar(r: IAChatResponse) {
  return r.toolCalls.map((c) => {
    const tool = TOOL_BY_NAME[c.function.name as keyof typeof TOOL_BY_NAME];
    if (!tool) return { name: c.function.name, ok: false, error: "tool desconocida" };
    let args: unknown;
    try {
      args = JSON.parse(c.function.arguments);
    } catch {
      return { name: c.function.name, ok: false, error: "args no JSON" };
    }
    const v = tool.validate(args);
    return { name: c.function.name, ok: v.ok, error: v.ok ? undefined : v.error };
  });
}

describe.skipIf(!vivo)("tool_calls con prompt real", () => {
  it(
    "openrouter modelo gratis",
    async () => {
      const r = await conReintentos(
        () =>
          chatOpenRouter({
            provider: "openrouter",
            model: "google/gemma-4-31b-it:free",
            messages: [{ role: "system", content: system }, { role: "user", content: usuario }],
            tools,
          }),
        "[OR free]",
      );
      console.log("[OR free] content:", JSON.stringify(r.content.slice(0, 140)));
      console.log("[OR free] calls:", r.toolCalls.map((c) => `${c.function.name} ${c.function.arguments.slice(0, 120)}`));
      console.log("[OR free] validación:", JSON.stringify(validar(r)));
      expect(r.toolCalls.length).toBeGreaterThan(0);
    },
    timeout,
  );

  it(
    "openrouter modelo de pago",
    async () => {
      const r = await conReintentos(
        () =>
          chatOpenRouter({
            provider: "openrouter",
            model: "openai/gpt-4o-mini",
            messages: [{ role: "system", content: system }, { role: "user", content: usuario }],
            tools,
          }),
        "[OR pago]",
      );
      console.log("[OR pago] content:", JSON.stringify(r.content.slice(0, 140)));
      console.log("[OR pago] calls:", r.toolCalls.map((c) => `${c.function.name} ${c.function.arguments.slice(0, 160)}`));
      console.log("[OR pago] validación:", JSON.stringify(validar(r)));
      expect(r.toolCalls.length).toBeGreaterThan(0);
      expect(validar(r).every((v) => v.ok)).toBe(true);
    },
    timeout,
  );

  it(
    "hf-space con el prompt actual",
    async () => {
      const r = await chatHF({
        provider: "hf-space",
        model: "CHRISTS20/qwn-uml-lora-7b-v2",
        messages: [{ role: "system", content: system }, { role: "user", content: usuario }],
        tools,
      });
      console.log("[HF actual] content:", JSON.stringify(r.content.slice(0, 200)));
      console.log("[HF actual] calls:", r.toolCalls.map((c) => `${c.function.name} ${c.function.arguments.slice(0, 120)}`));
      console.log("[HF actual] validación:", JSON.stringify(validar(r)));
      expect(r.toolCalls.length).toBeGreaterThan(0);
    },
    timeout,
  );

  it(
    "hf-space con protocolo explícito",
    async () => {
      const r = await chatHF({
        provider: "hf-space",
        model: "CHRISTS20/qwn-uml-lora-7b-v2",
        messages: [{ role: "system", content: `${system}${protocolo}` }, { role: "user", content: usuario }],
        tools,
      });
      console.log("[HF protocolo] content:", JSON.stringify(r.content.slice(0, 200)));
      console.log("[HF protocolo] calls:", r.toolCalls.map((c) => `${c.function.name} ${c.function.arguments.slice(0, 140)}`));
      console.log("[HF protocolo] validación:", JSON.stringify(validar(r)));
      expect(r.toolCalls.length).toBeGreaterThan(0);
    },
    timeout,
  );
});
