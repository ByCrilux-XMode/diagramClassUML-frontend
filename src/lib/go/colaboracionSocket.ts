const BASE_API = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
const BASE_WS =
  process.env.NEXT_PUBLIC_WS_URL ?? BASE_API.replace(/^http/, "ws");

export const WS_COLABORACION_BASE = `${BASE_WS}/colaboracion`;

export const RUTA_COLABORACION = "/colaboracion";

export function crearSocketColaboracion(proyectoId: string): typeof WebSocket {
  return class ColaboracionWebSocket extends WebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      const urlFinal = new URL(String(url));
      urlFinal.pathname = RUTA_COLABORACION;
      urlFinal.searchParams.set("proyectoId", proyectoId);
      super(urlFinal.href, protocols);
    }
  };
}