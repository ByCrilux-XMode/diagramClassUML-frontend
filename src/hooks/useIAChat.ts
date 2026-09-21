import { create } from "zustand";
import { applyPendingProposals, runAgentLoop } from "@/lib/ia/agentLoop";
import { SYSTEM_PROMPT } from "@/lib/ia/prompt";
import { IA_DEFAULT_MODEL, IA_DEFAULT_PROVIDER } from "@/lib/ia/config";
import type { IAProvider, PendingProposal, TurnTrace } from "@/lib/ia/types";
import { clearGhostPreview, confirmGhostPreview, hasGhostPreview, showGhostPreview } from "@/lib/ia/ghostPreview";

export interface ChatEntry {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  trace: TurnTrace[];
  notice?: string;
}

interface Salud {
  ok: boolean;
  error?: string;
}

interface IAChatState {
  proveedor: IAProvider;
  modelo: string;
  modelos: string[];
  pensando: boolean;
  mensajes: ChatEntry[];
  trace: TurnTrace[];
  error: string | null;
  salud: Salud | null;
  checking: boolean;
  pendingProposals: PendingProposal[] | null;
  propuestaResumen: string | null;
  setProveedor: (p: IAProvider) => void;
  setModelo: (m: string) => void;
  setModelos: (modelos: string[]) => void;
  cargarModelos: (p?: IAProvider) => Promise<void>;
  verificarSalud: (p?: IAProvider) => Promise<void>;
  enviar: (prompt: string) => Promise<void>;
  aprobarPropuesta: () => void;
  descartarPropuesta: () => void;
  reiniciar: () => void;
}

let chatSeq = 0;
function nextId(): string {
  chatSeq += 1;
  return `msg-${Date.now()}-${chatSeq}`;
}

const modeloInicial = IA_DEFAULT_MODEL;

export const useIAChat = create<IAChatState>((set, get) => ({
  proveedor: IA_DEFAULT_PROVIDER,
  modelo: modeloInicial,
  modelos: [],
  pensando: false,
  mensajes: [],
  trace: [],
  error: null,
  salud: null,
  checking: false,
  pendingProposals: null,
  propuestaResumen: null,

  setProveedor(p) {
    set({ proveedor: p, modelo: "", modelos: [], error: null });
  },

  setModelo(m) {
    set({ modelo: m, error: null });
  },

  setModelos(modelos) {
    set({ modelos });
  },

  async cargarModelos(p) {
    const provider = p ?? get().proveedor;
    try {
      const res = await fetch(`/api/ia/models?provider=${encodeURIComponent(provider)}`);
      const data = (await res.json().catch(() => ({}))) as {
        models?: string[];
        error?: string;
      };
      if (!res.ok) {
        set({ modelos: [], error: data.error ?? "No se pudieron listar los modelos." });
        return;
      }
      set({ modelos: data.models ?? [], error: null });
    } catch (err: unknown) {
      set({
        modelos: [],
        error: err instanceof Error ? err.message : "No se pudieron listar los modelos.",
      });
    }
  },

  async verificarSalud(p) {
    const provider = p ?? get().proveedor;
    set({ checking: true });
    try {
      const res = await fetch(`/api/ia/health?provider=${encodeURIComponent(provider)}`);
      const data = (await res.json().catch(() => ({}))) as Salud;
      set({ salud: data, checking: false });
    } catch {
      set({
        salud: { ok: false, error: "Sin conexión con el proveedor." },
        checking: false,
      });
    }
  },

  async enviar(prompt) {
    const { proveedor, modelo, pensando } = get();
    if (pensando) return;
    const trimmed = prompt.trim();
    if (!trimmed) return;
    if (!modelo.trim()) {
      set({ error: "Elige un modelo antes de enviar." });
      return;
    }

    set({ pensando: true, error: null, trace: [] });
    const userEntry: ChatEntry = { id: nextId(), role: "user", content: trimmed, trace: [] };
    set((s) => ({ mensajes: [...s.mensajes, userEntry] }));

    try {
      const result = await runAgentLoop({
        provider: proveedor,
        model: modelo,
        systemPrompt: SYSTEM_PROMPT,
        userMessage: trimmed,
        hitl: true,
        onTurn: (turn) => set((s) => ({ trace: [...s.trace, turn] })),
      });
      if (result.hitlRequired && result.pendingProposals && result.pendingProposals.length > 0) {
        const resumen = result.finalContent.trim() || "Propuesta lista para revisión humana.";
        const propuestaEntry: ChatEntry = {
          id: nextId(),
          role: "assistant",
          content: resumen,
          trace: result.trace,
          notice: `Propuesta: ${result.pendingProposals.length} cambio(s) pendiente(s) de aprobación humana.`,
        };
        set((s) => ({
          mensajes: [...s.mensajes, propuestaEntry],
          trace: result.trace,
          pendingProposals: result.pendingProposals ?? null,
          propuestaResumen: resumen,
        }));
        // Mostrar preview fantasma en el diagramador (opaco)
        try {
          showGhostPreview(result.pendingProposals ?? []);
        } catch {}
        return;
      }
      const notice =
        result.trace.length === 0
          ? "El modelo respondió sin usar herramientas: puede que no edite el diagrama."
          : undefined;
      const assistantEntry: ChatEntry = {
        id: nextId(),
        role: "assistant",
        content: result.finalContent.trim() || "Sin respuesta del modelo.",
        trace: result.trace,
        notice,
      };
      set((s) => ({
        mensajes: [...s.mensajes, assistantEntry],
        trace: result.trace,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const failEntry: ChatEntry = {
        id: nextId(),
        role: "system",
        content: `El asistente no respondió: ${message}`,
        trace: [],
      };
      set((s) => ({ mensajes: [...s.mensajes, failEntry] }));
    } finally {
      set({ pensando: false });
    }
  },

  aprobarPropuesta() {
    const { pendingProposals } = get();
    if (!pendingProposals || pendingProposals.length === 0) return;
    if (hasGhostPreview()) {
      confirmGhostPreview();
      // ejecutar solo los pendientes no visuales (validate, updateAttribute, etc.)
      const nonGhost = pendingProposals.filter(
        (p) => p.toolName !== "addClass" && p.toolName !== "connect"
      );
      let extraTrace: TurnTrace[] = [];
      let extraErrors: string[] = [];
      if (nonGhost.length > 0) {
        const res = applyPendingProposals(nonGhost);
        extraTrace = res.trace;
        extraErrors = res.errors;
      }
      const ghostCount = pendingProposals.length - nonGhost.length;
      const totalApplied = ghostCount + (nonGhost.length - extraErrors.length);
      const resumen =
        extraErrors.length === 0
          ? `✓ Aplicados ${totalApplied} cambio(s) al diagrama.`
          : `Aplicados ${totalApplied}/${pendingProposals.length}. Errores: ${extraErrors.join("; ")}`;
      const ghostTrace: TurnTrace[] = pendingProposals
        .filter((p) => p.toolName === "addClass" || p.toolName === "connect")
        .map((p) => ({ round: p.round, toolName: p.toolName, ok: true }));
      const entry: ChatEntry = {
        id: nextId(),
        role: "system",
        content: resumen,
        trace: [...ghostTrace, ...extraTrace],
      };
      set((s) => ({
        mensajes: [...s.mensajes, entry],
        trace: [...ghostTrace, ...extraTrace],
        pendingProposals: null,
        propuestaResumen: null,
      }));
      return;
    }
    const { trace: execTrace, applied, errors } = applyPendingProposals(pendingProposals);
    const resumen =
      errors.length === 0
        ? `✓ Aplicados ${applied} cambio(s) al diagrama.`
        : `Aplicados ${applied}/${pendingProposals.length}. Errores: ${errors.join("; ")}`;
    const entry: ChatEntry = {
      id: nextId(),
      role: "system",
      content: resumen,
      trace: execTrace,
    };
    set((s) => ({
      mensajes: [...s.mensajes, entry],
      trace: execTrace,
      pendingProposals: null,
      propuestaResumen: null,
    }));
  },

  descartarPropuesta() {
    const pending = get().pendingProposals;
    if (!pending || pending.length === 0) return;
    try {
      clearGhostPreview();
    } catch {}
    const entry: ChatEntry = {
      id: nextId(),
      role: "system",
      content: `Propuesta descartada (${pending.length} cambio(s) no aplicados).`,
      trace: [],
    };
    set((s) => ({
      mensajes: [...s.mensajes, entry],
      trace: [],
      pendingProposals: null,
      propuestaResumen: null,
    }));
  },

  reiniciar() {
    try {
      clearGhostPreview();
    } catch {}
    set({ mensajes: [], trace: [], error: null, pendingProposals: null, propuestaResumen: null });
  },
}));