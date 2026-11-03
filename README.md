This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Contexto de la IA por capas

Cada turno arma seis capas (rol/modo, diagrama, colaboradores, actividad, conversación y plan vigente) y las recorta según la ventana del proveedor. Si una fuente no se puede cargar (403, 500 o red), el turno sigue y el chip de la respuesta marca el contexto como _degradado_.

Variables de entorno relacionadas:

| Variable | Defecto | Uso |
|---|---|---|
| `IA_DEBUG_CONTEXT` | `0` | `1` imprime en consola los tokens y recortes de cada capa. |
| `IA_RESUMEN_CADA` | `20` | Mensajes nuevos necesarios para regenerar el resumen de la sala. |
| `IA_RESUMEN_MAX_MENSAJES` | `80` | Ventana máxima de mensajes que se envían al resumen. |
| `IA_RESUMEN_PROVIDER` / `NEXT_PUBLIC_IA_RESUMEN_PROVIDER` | proveedor por defecto | Proveedor barato para el resumen. |
| `IA_RESUMEN_MODEL` / `NEXT_PUBLIC_IA_RESUMEN_MODEL` | modelo por defecto | Modelo barato para el resumen. |

El resumen rodante se guarda en `salas.resumen` y solo avanza: un cliente con datos viejos no puede pisar uno más nuevo. En el chat privado nunca se lee ni se escribe el resumen, y sus mensajes no salen de ese navegador.

## Router de proveedores y fallback (fase 8)

Cada turno resuelve una cadena ordenada de proveedores según su tarea. El
formato es `proveedor:modelo,proveedor`; si se omite el modelo se usa el del
proveedor. La cadena del proyecto (`config_ia` en Mongo) tiene prioridad sobre
`.env`, y el proveedor elegido en el selector solo fija el primer intento del
turno.

| Variable | Defecto | Uso |
|---|---|---|
| `IA_CADENA_EDICION` | `openrouter,hf-space` | Turnos `build` que proponen ediciones. |
| `IA_CADENA_CONSULTA` | `hf-space,openrouter` | Plan y chat privado (solo lectura). |
| `IA_CADENA_RESUMEN` | `hf-space` | Resumen rodante de la sala, best-effort. |
| `IA_FALLBACK_TIMEOUT_MS` | `2 × IA_CHAT_TIMEOUT_MS` | Tope del turno completo, incluidos reintentos y tramos. |

`lib/ia/fallback.ts` reintenta una vez por proveedor ante 429, 5xx, timeout o
error de red, respeta `Retry-After` con un tope y no reintenta 400/401/403/404
ni un abort de la persona. El contexto se recorta otra vez en cada intento con
el perfil del tramo, y el chip de contexto muestra el recorte del que respondió.

La configuración del proyecto se lee con `GET /proyectos/:id/config-ia`
(cualquier colaborador) y se cambia con `PATCH` (solo CREADOR). Nunca guarda
claves: esas viven solo en el `.env` del servidor.

El selector muestra un badge de conformidad bajo demanda:

| Badge | Significado |
|---|---|
| **Edita** (verde) | El proveedor devolvió `tool_calls` nativos con una herramienta del registry. |
| **Edita por texto** (amarillo) | No hay `tool_calls` nativos, pero el parser recupera una herramienta válida. |
| **Solo consulta** (rojo) | Error, timeout o ninguna herramienta válida. |
| **Sin probar** | Todavía no se lanzó la sonda. |

La sonda se cachea 10 minutos en memoria y `sessionStorage`, se invalida al
cambiar de modelo y no bloquea el envío. Cuando un tramo falla y responde otro,
el panel muestra un aviso discreto (por ejemplo, "Respondió hf-space tras fallar
openrouter").

Ollama sigue disponible en el adaptador del servidor, pero no aparece en el
selector, en las cadenas ni en esta documentación.

## Sesión, límites y reversión (fase 9)

Todas las rutas `/api/ia/*` validan la cookie `tokenAcceso` contra
`GET /usuarios/me` antes de consumir un proveedor. La respuesta se cachea 60 s
con clave `sha256(token)` y tope de 1.000 entradas; un 401 del backend invalida
la entrada, mientras que un timeout o una caída responden 503 sin borrar la
caché. El navegador nunca ve las API keys ni el JWT.

| Variable | Defecto | Uso |
|---|---|---|
| `IA_LIMITE_CHAT_MINUTO` | `20` | Peticiones al proxy por usuario y minuto. `0` desactiva el cubo. |
| `IA_LIMITE_CHAT_HORA` | `200` | Peticiones al proxy por usuario y hora. `0` desactiva el cubo. |
| `BASE_URL` / `NEXT_PUBLIC_BASE_URL` | `http://localhost:3000` | Backend usado para validar la sesión. |

El proxy responde 429 con `Retry-After` cuando se agota un cubo. Nest mantiene
el límite autoritativo de turnos (`IA_LIMITE_TURNOS_MINUTO`, 10 por usuario y
proyecto) antes de validar el permiso y de crear el turno.

La pestaña **Actividad** ofrece deshacer el último turno de IA solo a CREADOR y
EDITOR y solo cuando el servidor devuelve `deshacible: true`. La reversión se
construye desde los `antes` de la bitácora, se aprueba por el mismo camino HITL
y se registra como un turno humano nuevo con `revierteTurnoId`. Si falla a
mitad, no se marca como reversión y los cambios aplicados quedan como un turno
normal. `lib/actividad/reversion.ts` es la única puerta de esa reconstrucción.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
