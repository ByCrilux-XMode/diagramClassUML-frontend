#!/usr/bin/env node
/**
 * Proveedor falso — servidor HTTP local que imita los dos formatos que usan
 * los adaptadores del proyecto, para probar el camino real sin gastar cuota:
 *
 *   OpenRouter  POST /api/v1/chat/completions  -> forma OpenAI
 *   HF Space    POST /generate                 -> { texto }
 *
 * Control:
 *   POST /__plan     { respuestas: [{ content?, toolCalls? }] }  encola respuestas
 *   GET  /__requests devuelve lo recibido (para comprobar el presupuesto)
 *   POST /__reset    limpia cola y registro
 *   GET  /health     { ok: true }
 *
 * Uso:
 *   node test/proveedor-falso.mjs [puerto]
 *   HF_SPACE_URL=http://127.0.0.1:4010 OPENROUTER_BASE_URL=http://127.0.0.1:4010 npx next dev -p 5174
 */

import { createServer } from "node:http";

const PUERTO = Number(process.argv[2] ?? process.env.PROVEEDOR_FALSO_PUERTO ?? 4010);

/** @type {Array<{content?: string, toolCalls?: Array<{name: string, args: unknown}>}>} */
let cola = [];
/** @type {Array<{ruta: string, cuerpo: unknown, caracteres: number}>} */
let peticiones = [];

const servidor = createServer(async (req, res) => {
  const trozos = [];
  for await (const trozo of req) trozos.push(trozo);
  const crudo = Buffer.concat(trozos).toString("utf8");
  const ruta = (req.url ?? "/").split("?")[0];

  const json = (codigo, cuerpo) => {
    res.writeHead(codigo, { "Content-Type": "application/json" });
    res.end(JSON.stringify(cuerpo));
  };

  if (req.method === "GET" && ruta === "/health") return json(200, { ok: true, servicio: "proveedor-falso" });

  if (req.method === "GET" && ruta === "/__requests") {
    return json(200, { total: peticiones.length, peticiones });
  }

  if (req.method === "POST" && ruta === "/__reset") {
    cola = [];
    peticiones = [];
    return json(200, { ok: true });
  }

  if (req.method === "POST" && ruta === "/__plan") {
    const cuerpo = JSON.parse(crudo || "{}");
    const respuestas = Array.isArray(cuerpo.respuestas) ? cuerpo.respuestas : [];
    cola.push(...respuestas);
    return json(200, { ok: true, enCola: cola.length });
  }

  if (req.method !== "POST") return json(404, { error: "ruta desconocida", ruta });

  let cuerpo;
  try {
    cuerpo = crudo ? JSON.parse(crudo) : {};
  } catch {
    return json(400, { error: "JSON invalido" });
  }

  peticiones.push({ ruta, cuerpo, caracteres: crudo.length });

  const siguiente = cola.shift();

  if (ruta === "/api/v1/chat/completions") {
    const tieneTools = Array.isArray(cuerpo.tools) && cuerpo.tools.length > 0;
    const toolCalls = siguiente?.toolCalls ?? (tieneTools && !siguiente ? [{ name: "getState", args: {} }] : []);
    return json(200, {
      id: `fake-${Date.now()}`,
      object: "chat.completion",
      model: cuerpo.model ?? "fake",
      choices: [
        {
          index: 0,
          finish_reason: toolCalls.length > 0 ? "tool_calls" : "stop",
          message: {
            role: "assistant",
            content: siguiente?.content ?? (toolCalls.length > 0 ? null : "respuesta falsa"),
            tool_calls: toolCalls.map((tc, i) => ({
              id: `call_${Date.now()}_${i}`,
              type: "function",
              function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
            })),
          },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  }

  if (ruta === "/generate") {
    const mensajes = Array.isArray(cuerpo.mensajes) ? cuerpo.mensajes : [];
    const ultimo = mensajes[mensajes.length - 1];
    return json(200, {
      texto: siguiente?.content ?? `eco: ${String(ultimo?.content ?? "").slice(0, 80)}`,
    });
  }

  return json(404, { error: "ruta desconocida", ruta });
});

servidor.listen(PUERTO, "127.0.0.1", () => {
  console.log(`proveedor-falso escuchando en http://127.0.0.1:${PUERTO}`);
});
