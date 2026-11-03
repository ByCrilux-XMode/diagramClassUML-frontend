# Pruebas de la IA

## proveedor-falso.mjs

Servidor local que imita los dos formatos que consumen los adaptadores, para
probar el camino real (`navegador → /api/ia/chat → adaptador → HTTP`) sin gastar
cuota ni depender de un modelo.

| Ruta | Imita |
|---|---|
| `POST /api/v1/chat/completions` | OpenRouter (forma OpenAI, con `tool_calls`) |
| `POST /generate` | HF Space (Gradio, `{ texto }`) |

Control:

```bash
# arrancar
npm run proveedor-falso          # http://127.0.0.1:4010

# encolar respuestas (se consumen en orden)
curl -X POST http://127.0.0.1:4010/__plan -H 'Content-Type: application/json' \
  -d '{"respuestas":[{"content":"ok"},{"toolCalls":[{"name":"addClass","args":{"clave":"pedido"}}]}]}'

# ver lo que llegó (sirve para comprobar el presupuesto de contexto)
curl http://127.0.0.1:4010/__requests

# limpiar
curl -X POST http://127.0.0.1:4010/__reset
```

## Apuntar la app al falso

```bash
HF_SPACE_URL=http://127.0.0.1:4010 \
OPENROUTER_BASE_URL=http://127.0.0.1:4010 \
npx next dev -p 5174
```

El `.env.local` conserva los proveedores reales; el override solo afecta a esa
corrida.

## Qué queda pendiente

Las pruebas de `lib/actividad` (diff, resumen) y `lib/ia/context` (presupuesto,
historial) se escriben junto con esas piezas: hoy los módulos no existen, así que
un test importaría archivos inexistentes y no compilaría.
