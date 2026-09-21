import { create } from "zustand";
import {
  cerrarSesion as apiCerrarSesion,
  iniciarSesion as apiIniciarSesion,
  obtenerUsuarioActual as apiObtenerUsuarioActual,
  registrarse as apiRegistrarse,
} from "@/lib/auth";
import type { Credenciales, RegistroInput, Usuario } from "@/types/auth";

export interface ProyectoItem {
  proyectoId: number;
  nombre: string;
}

interface AuthState {
  usuario: Usuario | null;
  loading: boolean;
  verificando: boolean;
  error: string | null;
  proyectos: ProyectoItem[];
  login: (credenciales: Credenciales) => Promise<boolean>;
  register: (input: RegistroInput) => Promise<boolean>;
  logout: () => Promise<void>;
  cargarSesion: () => Promise<void>;
  setProyectos: (proyectos: ProyectoItem[]) => void;
  refreshKey: number;
  bumpRefresh: () => void;
  clearError: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  usuario: null,
  loading: false,
  verificando: true,
  error: null,
  proyectos: [],
  refreshKey: 0,

  async login(credenciales) {
    set({ loading: true, error: null });
    try {
      const { usuario } = await apiIniciarSesion(credenciales);
      set({ usuario, loading: false, error: null });
      return true;
    } catch (err: unknown) {
      const message = obtenerMensajeError(err);
      set({ error: message, loading: false });
      return false;
    }
  },

  async register(input) {
    set({ loading: true, error: null });
    try {
      const { usuario } = await apiRegistrarse(input);
      set({ usuario, loading: false, error: null });
      return true;
    } catch (err: unknown) {
      const message = obtenerMensajeError(err);
      set({ error: message, loading: false });
      return false;
    }
  },

  async logout() {
    try {
      await apiCerrarSesion();
    } catch {
      // el backend puede fallar (offline) pero igual limpiamos localmente
    } finally {
      set({ usuario: null, proyectos: [] });
    }
  },

  async cargarSesion() {
    set({ verificando: true });
    try {
      const usuario = await apiObtenerUsuarioActual();
      set({ usuario, verificando: false, error: null });
    } catch {
      set({ usuario: null, verificando: false });
    }
  },

  setProyectos(proyectos) {
    set({ proyectos });
  },

  bumpRefresh() {
    set((s) => ({ refreshKey: s.refreshKey + 1 }));
  },

  clearError() {
    set({ error: null });
  },
}));

function obtenerMensajeError(err: unknown): string {
  if (
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    typeof err.response === "object" &&
    err.response !== null &&
    "status" in err.response
  ) {
    const status = (err.response as { status: number }).status;
    if (status === 401) return "Credenciales inválidas.";
    if (status === 409) return "El usuario ya existe.";
  }
  return "Ocurrió un error. Inténtalo de nuevo.";
}
