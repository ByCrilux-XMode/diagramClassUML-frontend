import { IA_LIMITE_CHAT_HORA, IA_LIMITE_CHAT_MINUTO } from "./config";

/**
 * Cubo de fichas por usuario para el proxy de IA (fase 9, D66/D67).
 *
 * Dos ventanas independientes (minuto y hora) con capacidad y recarga
 * configurables. La clave es el `usuarioId`: las IPs se descartan porque un
 * aula comparte salida NAT. El estado es memoria del proceso; el límite
 * autoritativo de turnos sigue en Nest.
 */

export const VENTANA_MINUTO_MS = 60_000;
export const VENTANA_HORA_MS = 3_600_000;

export interface OpcionesLimite {
  porMinuto?: number;
  porHora?: number;
  ahora?: number;
}

export interface ResultadoLimite {
  permitido: boolean;
  /** Segundos que hay que esperar antes del siguiente intento. */
  retryAfterSegundos: number;
  /** Cupo restante en la ventana más exigente. */
  restantes: number;
  /** Ventana que causó el rechazo, si lo hubo. */
  motivo?: "minuto" | "hora";
}

interface CuboFichas {
  capacidad: number;
  recargaPorMs: number;
  fichas: number;
  ultimaRecarga: number;
}

interface CubosUsuario {
  minuto: CuboFichas | null;
  hora: CuboFichas | null;
}

const cubos = new Map<string, CubosUsuario>();

function capacidadValida(valor: number | undefined): number {
  if (valor === undefined || !Number.isFinite(valor)) return 0;
  return valor > 0 ? Math.floor(valor) : 0;
}

function crearCubo(
  capacidad: number,
  ventanaMs: number,
  ahora: number,
): CuboFichas | null {
  if (capacidad <= 0) return null;
  return {
    capacidad,
    recargaPorMs: capacidad / ventanaMs,
    fichas: capacidad,
    ultimaRecarga: ahora,
  };
}

function crearCubos(
  porMinuto: number,
  porHora: number,
  ahora: number,
): CubosUsuario {
  return {
    minuto: crearCubo(capacidadValida(porMinuto), VENTANA_MINUTO_MS, ahora),
    hora: crearCubo(capacidadValida(porHora), VENTANA_HORA_MS, ahora),
  };
}

function recargar(cubo: CuboFichas, ahora: number): void {
  const transcurrido = ahora - cubo.ultimaRecarga;
  if (transcurrido <= 0) return;
  cubo.fichas = Math.min(
    cubo.capacidad,
    cubo.fichas + transcurrido * cubo.recargaPorMs,
  );
  // La tasa de recarga es un cociente: al completar exactamente una ficha el
  // resultado puede quedar en 0.9999999999999999. Se normaliza a la capacidad.
  if (cubo.capacidad - cubo.fichas < 1e-9) cubo.fichas = cubo.capacidad;
  cubo.ultimaRecarga = ahora;
}

function segundosHastaUnaFicha(cubo: CuboFichas, ahora: number): number {
  recargar(cubo, ahora);
  // Tolerancia de coma flotante: una ficha exacta puede quedar en 0.999…9.
  if (cubo.fichas >= 1 - 1e-9) return 0;
  // El epsilon evita que un valor exacto (p. ej. 1800 s) suba a 1801 por
  // representación binaria de la tasa de recarga.
  return Math.max(1, Math.ceil((1 - cubo.fichas) / cubo.recargaPorMs / 1000 - 1e-6));
}

function obtenerCubos(clave: string, opciones: OpcionesLimite, ahora: number): CubosUsuario {
  const porMinuto = capacidadValida(opciones.porMinuto ?? IA_LIMITE_CHAT_MINUTO);
  const porHora = capacidadValida(opciones.porHora ?? IA_LIMITE_CHAT_HORA);
  const existente = cubos.get(clave);
  if (existente) return existente;

  const nuevos = crearCubos(porMinuto, porHora, ahora);
  cubos.set(clave, nuevos);
  return nuevos;
}

/**
 * Consume una ficha de la clave. Si una ventana está agotada, no consume nada
 * y devuelve los segundos de espera de la ventana más restrictiva.
 */
export function consumirLimite(
  clave: string,
  opciones: OpcionesLimite = {},
): ResultadoLimite {
  const ahora = opciones.ahora ?? Date.now();
  const entrada = obtenerCubos(clave, opciones, ahora);
  const { minuto, hora } = entrada;

  if (!minuto && !hora) {
    return { permitido: true, retryAfterSegundos: 0, restantes: Number.POSITIVE_INFINITY };
  }

  const esperaMinuto = minuto ? segundosHastaUnaFicha(minuto, ahora) : 0;
  const esperaHora = hora ? segundosHastaUnaFicha(hora, ahora) : 0;

  if (esperaMinuto > 0 || esperaHora > 0) {
    const motivo = esperaMinuto >= esperaHora ? "minuto" : "hora";
    return {
      permitido: false,
      retryAfterSegundos: Math.max(esperaMinuto, esperaHora, 1),
      restantes: 0,
      motivo,
    };
  }

  if (minuto) minuto.fichas = Math.max(0, minuto.fichas - 1);
  if (hora) hora.fichas = Math.max(0, hora.fichas - 1);

  const restantes = Math.max(
    0,
    Math.floor(Math.min(minuto?.fichas ?? Number.POSITIVE_INFINITY, hora?.fichas ?? Number.POSITIVE_INFINITY)),
  );

  return { permitido: true, retryAfterSegundos: 0, restantes };
}

/** Respuesta 429 del proxy con `Retry-After`. */
export function respuestaLimite(resultado: ResultadoLimite): Response {
  return Response.json(
    {
      error: "Has alcanzado el límite de uso del asistente. Espera un momento y vuelve a intentarlo.",
      motivo: "limite",
    },
    {
      status: 429,
      headers: { "Retry-After": String(resultado.retryAfterSegundos) },
    },
  );
}

/** Solo para pruebas: vacía todos los cubos. */
export function reiniciarLimites(): void {
  cubos.clear();
}

/** Solo para pruebas: número de usuarios con cubo. */
export function tamanoLimites(): number {
  return cubos.size;
}
