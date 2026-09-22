import { create } from "zustand";

export interface ExportTarget {
  proyectoId: number | string;
  nombre: string;
}

interface HelpActionsState {
  /** Modal de crear proyecto — vive en app/proyectos/layout.tsx. */
  createOpen: boolean;
  /** Modal de exportar/descargar backend — vive en app/proyectos/layout.tsx. */
  exportTarget: ExportTarget | null;
  openCreateModal: () => void;
  closeCreateModal: () => void;
  openExportModal: (target: ExportTarget) => void;
  closeExportModal: () => void;
}

/**
 * Puente entre el chat de ayuda (renderizado en page.tsx) y los modales que
 * monta layout.tsx: el asistente pide "crea un proyecto" → abre el modal real.
 */
export const useHelpActions = create<HelpActionsState>((set) => ({
  createOpen: false,
  exportTarget: null,

  openCreateModal: () => set({ createOpen: true }),
  closeCreateModal: () => set({ createOpen: false }),

  openExportModal: (target) => set({ exportTarget: target }),
  closeExportModal: () => set({ exportTarget: null }),
}));