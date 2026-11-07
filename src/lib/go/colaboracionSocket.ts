const BASE_API = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
const BASE_WS =
  process.env.NEXT_PUBLIC_WS_URL ?? BASE_API.replace(/^http/, "ws");

export const WS_COLABORACION_BASE = `${BASE_WS}/colaboracion`;

export const RUTA_COLABORACION = "/colaboracion";

export function crearSocketColaboracion(proyectoId: string, token?: string | null): typeof WebSocket {
  return class ColaboracionWebSocket extends WebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      const urlFinal = new URL(String(url));
      urlFinal.pathname = RUTA_COLABORACION;
      urlFinal.searchParams.set("proyectoId", proyectoId);
      // Con el proxy same-origin la cookie no viaja al host del backend en el
      // handshake; el ticket corto lo resuelve.
      if (token) urlFinal.searchParams.set("token", token);
      super(urlFinal.href, protocols);
    }
  };
}
