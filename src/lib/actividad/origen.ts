export interface PersonaOrigen {
  usuarioId: number;
  nombre: string;
}

export interface OrigenIA {
  turnoId: string;
  modelo: string;
  solicitadoPor: PersonaOrigen;
  proyectoId: string | null;
}

/**
 * Pila de contextos de origen.
 *
 * El diff vive en `useColaboracion` y la ejecución de tools en `agentLoop` /
 * `useIAChat`; pasar el origen por props obligaría a atravesar cinco
 * componentes. Un módulo hace lo mismo que `graphStore`.
 *
 * Condición de seguridad: las escrituras usan `executeToolSync`. El flag se
 * abre y se cierra alrededor de una llamada sin `await` en medio. Las tools de
 * consulta pueden ser asíncronas, pero corren fuera de esta pila. Hay un test
 * que falla si `executeToolSync` deja de ser síncrono.
 */
const pila: OrigenIA[] = [];

export function withAiOrigin<T>(origen: OrigenIA, fn: () => T): T {
  pila.push(origen);
  try {
    return fn();
  } finally {
    pila.pop();
  }
}

export function origenActual(): OrigenIA | null {
  return pila.length > 0 ? pila[pila.length - 1] : null;
}

/** Solo para pruebas: deja la pila limpia. */
export function reiniciarOrigen(): void {
  pila.length = 0;
}
