import type { CambioActividad } from "./diff";

export interface PersonaEvento {
  usuarioId: number;
  nombre: string;
}

export interface EventoActividad {
  sesionId: string;
  secuencia: number;
  actorTipo: "humano" | "ia" | "sistema";
  actorUsuarioId?: number | null;
  actorNombre: string;
  origen?: "manual" | "ia" | "import" | "vision";
  tipo: string;
  entidades: string[];
  cambios: CambioActividad[];
  turnoId?: string | null;
  /** Turno de IA que esta reversión humana deshace (fase 9, D70). */
  revierteTurnoId?: string | null;
  modelo?: string | null;
  resumen: string;
  mensajeId?: string | null;
  solicitadoPor?: PersonaEvento | null;
  aprobadoPor?: PersonaEvento | null;
  ocurridoEn?: string;
}

export interface OpcionesClienteActividad {
  proyectoId: string | number;
  baseUrl: string;
  /** Se invoca una sola vez cuando el servidor responde 403. */
  alPerderPermiso?: (mensaje: string) => void;
  /** Inyectable en pruebas. */
  fetchImpl?: typeof fetch;
}

const TAMANO_LOTE = 20;
const ESPERA_LOTE_MS = 2000;
const BACKOFF_INICIAL_MS = 1000;
const BACKOFF_MAXIMO_MS = 30000;

/**
 * Cola en memoria de eventos de actividad.
 *
 * Entrega en tres niveles: lote normal, vaciado al ocultar la pestaña y envío
 * con `keepalive` al cerrarla. La idempotencia del servidor permite vaciar sin
 * miedo a duplicar.
 */
export class ClienteActividad {
  private cola: EventoActividad[] = [];
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private espera: ReturnType<typeof setTimeout> | null = null;
  private enviando = false;
  private backoff = BACKOFF_INICIAL_MS;
  private detenido = false;
  private readonly proyectoId: string | number;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly alPerderPermiso?: (mensaje: string) => void;
  private readonly alOcultar = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      void this.vaciar(false);
    }
  };
  private readonly alCerrar = () => {
    void this.vaciar(true);
  };

  constructor(opciones: OpcionesClienteActividad) {
    this.proyectoId = opciones.proyectoId;
    this.baseUrl = opciones.baseUrl.replace(/\/$/, "");
    this.fetchImpl = (opciones.fetchImpl ?? fetch).bind(globalThis);
    this.alPerderPermiso = opciones.alPerderPermiso;

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.alOcultar);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", this.alCerrar);
    }
  }

  encolar(evento: EventoActividad): void {
    if (this.detenido) return;
    this.cola.push(evento);
    if (this.cola.length >= TAMANO_LOTE) {
      void this.vaciar(false);
      return;
    }
    this.programar();
  }

  get pendientes(): number {
    return this.cola.length;
  }

  detener(): void {
    this.detenido = true;
    if (this.temporizador) clearTimeout(this.temporizador);
    if (this.espera) clearTimeout(this.espera);
    this.temporizador = null;
    this.espera = null;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.alOcultar);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", this.alCerrar);
    }
  }

  private programar(): void {
    if (this.detenido || this.temporizador || this.enviando) return;
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      void this.vaciar(false);
    }, ESPERA_LOTE_MS);
  }

  async vaciar(keepalive: boolean): Promise<void> {
    if (this.detenido || this.enviando || this.cola.length === 0) return;
    if (this.temporizador) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
    if (this.espera) {
      clearTimeout(this.espera);
      this.espera = null;
    }

    this.enviando = true;
    const lote = this.cola.slice(0, TAMANO_LOTE);
    const cuerpo = JSON.stringify({ eventos: lote });
    const url = `${this.baseUrl}/proyectos/${this.proyectoId}/eventos`;

    try {
      if (keepalive) {
        const ok = await this.enviarConKeepalive(url, cuerpo);
        if (!ok) return;
      } else {
        const respuesta = await this.fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: cuerpo,
        });
        if (respuesta.status === 403) {
          this.detener();
          this.alPerderPermiso?.("Ya no tienes permiso para registrar cambios en este proyecto.");
          return;
        }
        if (!respuesta.ok) {
          throw new Error(`HTTP ${respuesta.status}`);
        }
      }

      this.cola.splice(0, lote.length);
      this.backoff = BACKOFF_INICIAL_MS;
      if (this.cola.length > 0) this.programar();
    } catch {
      // El lote permanece en la cola y se reintenta con espera creciente.
      this.reintentar();
    } finally {
      this.enviando = false;
    }
  }

  private async enviarConKeepalive(url: string, cuerpo: string): Promise<boolean> {
    try {
      const respuesta = await this.fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: cuerpo,
        keepalive: true,
      });
      return respuesta.ok;
    } catch {
      // `fetch keepalive` no sobrevive en todos los navegadores: se intenta el
      // beacon con texto plano (el backend acepta JSON con ese content-type).
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([cuerpo], { type: "text/plain;charset=UTF-8" });
        return navigator.sendBeacon(url, blob);
      }
      return false;
    }
  }

  private reintentar(): void {
    if (this.detenido) return;
    if (this.espera) clearTimeout(this.espera);
    this.espera = setTimeout(() => {
      this.espera = null;
      void this.vaciar(false);
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, BACKOFF_MAXIMO_MS);
  }
}
