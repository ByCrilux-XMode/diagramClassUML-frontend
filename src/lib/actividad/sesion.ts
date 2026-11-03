export interface SesionActividad {
  sesionId: string;
  /** Secuencia monotónica dentro de la sesión; empieza en 1. */
  siguienteSecuencia: () => number;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Respaldo para entornos sin Web Crypto (tests de Node antiguos).
  return `ses-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Identidad lógica de una sesión de edición.
 *
 * No se usa `doc.clientID` de Yjs: cambia en cada recarga y no identifica una
 * sesión. La tupla `(proyectoId, sesionId, secuencia)` es la clave de
 * idempotencia del servidor.
 */
export function crearSesion(): SesionActividad {
  let secuencia = 0;
  return {
    sesionId: uuid(),
    siguienteSecuencia: () => {
      secuencia += 1;
      return secuencia;
    },
  };
}
