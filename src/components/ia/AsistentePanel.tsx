"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  ChevronRight,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Send,
  Trash2,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useIAChat } from "@/hooks/useIAChat";
import type { ChatEntry } from "@/hooks/useIAChat";
import type { IAProvider, PendingProposal } from "@/lib/ia/types";
import { HF_USE_ROUTER } from "@/lib/ia/config";

const QUICK_ACTIONS: Array<{ label: string; prompt: string }> = [
  { label: "Validar", prompt: "Ejecuta validate para revisar el diagrama actual y dime qué observaciones hay." },
  { label: "Crear Usuario", prompt: "Crea una clase Usuario (key 'usuario') con id: Integer, nombre: String y email: String." },
  { label: "Conectar 1..*", prompt: "Si existen las clases 'cliente' y 'pedido', conéctalas con una asociación 1..* (Pedido -> Cliente). Si no existen, créalas primero." },
];

export interface AsistentePanelProps {
  readOnly?: boolean;
}

function estatusClass(salud: { ok: boolean } | null): string {
  if (salud === null) {
    return "h-1.5 w-1.5 rounded-full bg-outline-variant";
  }
  return salud.ok
    ? "h-1.5 w-1.5 rounded-full bg-green-500"
    : "h-1.5 w-1.5 rounded-full bg-red-500";
}

function estatusLabel(salud: { ok: boolean; error?: string } | null, checking: boolean): string {
  if (checking) return "Verificando...";
  if (salud === null) return "Sin verificar";
  return salud.ok ? "Conectado" : "Sin conexión";
}

function ToolRounds({ trace, pensando }: { trace: ChatEntry["trace"]; pensando?: boolean }) {
  if (!pensando && trace.length === 0) return null;
  return (
    <div className="flex max-w-full flex-wrap gap-1">
      <span className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
        Tools
      </span>
      {pensando && trace.length === 0 && (
        <span className="font-code-sm text-code-sm text-on-surface-variant">esperando...</span>
      )}
      {trace.map((t, idx) => (
        <span
          key={`${t.round}-${t.toolName}-${idx}`}
          className={`rounded px-1.5 py-0.5 font-code-sm text-code-sm ${
            t.ok ? "bg-primary/10 text-primary" : "bg-error/10 text-error"
          }`}
          title={t.error ?? ""}
        >
          R{t.round + 1}:{t.toolName}
          {t.ok ? " ✓" : " ✗"}
        </span>
      ))}
    </div>
  );
}

function Mensaje({ entry }: { entry: ChatEntry }) {
  const isUser = entry.role === "user";
  const isSystem = entry.role === "system";
  if (isSystem) {
    return (
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-error" />
        <p className="font-code-sm text-code-sm text-error">{entry.content}</p>
      </div>
    );
  }
  if (isUser) {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-md bg-primary/10 px-3 py-2 font-body-md text-body-md text-on-surface">
          {entry.content}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-1.5">
      <p className="max-w-[92%] rounded-md border border-outline-variant/60 bg-surface-container-low px-3 py-2 font-body-md text-body-md text-on-surface">
        {entry.content}
      </p>
      {entry.notice && (
        <p className="font-code-sm text-code-sm text-amber-lock">{entry.notice}</p>
      )}
      <ToolRounds trace={entry.trace} pensando={false} />
    </div>
  );
}

function formatProposal(p: PendingProposal): string {
  const a = p.args as Record<string, unknown>;
  switch (p.toolName) {
    case "addClass":
      return `Crear clase ${String(a.name ?? a.key ?? "?")} (key:${String(a.key ?? "?")})`;
    case "removeClass":
      return `Eliminar clase ${String(a.key ?? "?")}`;
    case "rename":
      return `Renombrar ${String(a.key ?? "?")} → ${String(a.newName ?? "?")}`;
    case "connect":
      return `Conectar ${String(a.from ?? "?")} → ${String(a.to ?? "?")} [${String(a.kind ?? "?")}]`;
    case "disconnect":
      return `Desconectar ${String(a.linkKey ?? "?")}`;
    case "updateAttribute":
      return `Actualizar atributo ${String(a.classKey ?? "?")}.${String((a.attribute as Record<string, unknown> | undefined)?.name ?? "?")} (${String(a.action ?? "?")})`;
    case "updateMethod":
      return `Actualizar método ${String(a.classKey ?? "?")}.${String((a.method as Record<string, unknown> | undefined)?.name ?? "?")} (${String(a.action ?? "?")})`;
    case "replaceAll":
      return `Reemplazar modelo completo`;
    case "validate":
      return `Validar diagrama`;
    default:
      return `${p.toolName} ${JSON.stringify(a).slice(0, 80)}`;
  }
}
//human in loop
function PropuestaPendiente({
  pending,
  resumen,
  onAprobar,
  onDescartar,
  readOnly,
}: {
  pending: PendingProposal[];
  resumen: string | null;
  onAprobar: () => void;
  onDescartar: () => void;
  readOnly: boolean;
}) {
  return (
    <div className="mx-3 mb-3 flex max-h-[45vh] flex-col overflow-hidden rounded-md border border-amber-300 bg-amber-50">
      <div className="flex flex-1 flex-col overflow-y-auto p-3">
        <div className="flex items-start gap-2">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="flex-1 min-w-0">
            <p className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-amber-800">
              Revisión humana requerida — {pending.length} cambio(s) propuesto(s)
            </p>
            {resumen && (
              <p className="mt-1 break-words font-body-md text-body-md text-on-surface">{resumen}</p>
            )}
            <ul className="mt-2 max-h-32 list-disc overflow-y-auto break-words pl-4">
              {pending.map((p: PendingProposal) => (
                <li key={p.id} className="break-words font-code-sm text-code-sm text-on-surface-variant">
                  {formatProposal(p)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="sticky bottom-0 flex gap-2 border-t border-amber-200 bg-amber-50 p-3 pt-2">
        <button
          onClick={onAprobar}
          disabled={readOnly}
          className="rounded bg-primary px-3 py-1.5 font-badge-label text-badge-label font-bold text-on-primary hover:bg-primary/90 disabled:opacity-40"
        >
          Aplicar
        </button>
        <button
          onClick={onDescartar}
          disabled={readOnly}
          className="rounded border border-outline/60 bg-surface px-3 py-1.5 font-badge-label text-badge-label font-bold text-on-surface hover:bg-surface-container-low disabled:opacity-40"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}

export default function AsistentePanel({ readOnly = false }: AsistentePanelProps) {
  const {
    proveedor,
    setProveedor,
    modelo,
    setModelo,
    modelos,
    pensando,
    mensajes,
    trace,
    error,
    salud,
    checking,
    pendingProposals,
    propuestaResumen,
    verificarSalud,
    cargarModelos,
    enviar,
    aprobarPropuesta,
    descartarPropuesta,
    reiniciar,
  } = useIAChat();

  const [abierto, setAbierto] = useState(true);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const usarInputLibre = useMemo(() => modelos.length === 0, [modelos]);

  useEffect(() => {
    void verificarSalud();
    void cargarModelos();
  }, [verificarSalud, cargarModelos]);

  useEffect(() => {
    void verificarSalud(proveedor);
    void cargarModelos(proveedor);
  }, [proveedor, verificarSalud, cargarModelos]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes, pensando, trace]);

  const puedeEnviar =
    !pensando && !readOnly && modelo.trim() !== "" && input.trim() !== "" && !pendingProposals;

  const handleSend = () => {
    if (!puedeEnviar) return;
    const content = input;
    setInput("");
    void enviar(content);
  };

  const handleQuickAction = (prompt: string) => {
    if (pensando || readOnly || !!pendingProposals) return;
    setInput("");
    void enviar(prompt);
  };

  if (!abierto) {
    return (
      <div className="flex h-full shrink-0 flex-col items-center border-l border-outline-variant/60 bg-surface">
        <button
          onClick={() => setAbierto(true)}
          className="flex h-full w-8 items-center justify-center text-on-surface-variant hover:bg-surface-container-low"
          title="Abrir asistente IA"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <aside className="flex h-full w-[340px] max-w-[90vw] shrink-0 flex-col border-l border-outline-variant/60 bg-surface">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-outline-variant/60 px-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </span>
          <span className="font-class-name text-class-name text-on-surface">Asistente IA</span>
          <span className="flex items-center gap-1.5">
            <span className={estatusClass(salud)} />
            <span className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
              {estatusLabel(salud, checking)}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => void verificarSalud()}
            disabled={checking}
            className="rounded p-1 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-50"
            title="Recomprobar conexión"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={reiniciar}
            className="rounded p-1 text-on-surface-variant hover:bg-surface-container-low"
            title="Limpiar historial"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setAbierto(false)}
            className="rounded p-1 text-on-surface-variant hover:bg-surface-container-low"
            title="Colapsar panel"
          >
            <PanelRightClose className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="flex shrink-0 flex-col gap-2 border-b border-outline-variant/60 px-3 py-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
              Proveedor
            </span>
            <select
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value as IAProvider)}
              disabled={pensando}
              className="rounded border border-outline/60 bg-surface-container-low px-2 py-1.5 font-code-sm text-code-sm text-on-surface disabled:opacity-50"
            >
              <option value="ollama">Ollama — Túnel PC (Cloudflare, examen)</option>
              <option value="hf-space">HF Space — Respaldo (ZeroGPU, público)</option>
              {HF_USE_ROUTER && <option value="huggingface">Hugging Face (Inferencia)</option>}
              {HF_USE_ROUTER && <option value="openrouter">OpenRouter</option>}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
              Modelo
            </span>
            {usarInputLibre ? (
              <input
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                disabled={pensando}
                placeholder="ej. llama3.1:8b o org/modelo"
                className="rounded border border-outline/60 bg-surface-container-low px-2 py-1.5 font-code-sm text-code-sm text-on-surface placeholder:text-on-surface-variant disabled:opacity-50"
              />
            ) : (
              <select
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                disabled={pensando}
                className="rounded border border-outline/60 bg-surface-container-low px-2 py-1.5 font-code-sm text-code-sm text-on-surface disabled:opacity-50"
              >
                <option value="">Elegir modelo...</option>
                {modelos.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>

        <div className="flex flex-wrap gap-1">
          {QUICK_ACTIONS.map((accion) => (
            <button
              key={accion.label}
              onClick={() => handleQuickAction(accion.prompt)}
              disabled={pensando || readOnly || !modelo.trim() || !!pendingProposals}
              className="inline-flex items-center gap-1 rounded border border-primary/25 bg-primary/5 px-2 py-1 font-code-sm text-code-sm text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
            >
              <Wrench className="h-3 w-3" />
              {accion.label}
            </button>
          ))}
        </div>

        {readOnly && (
          <p className="font-code-sm text-code-sm text-amber-lock">
            Vista de solo lectura: el asistente está deshabilitado.
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3" ref={scrollRef}>
        {mensajes.length === 0 && (
          <p className="font-body-md text-body-md text-on-surface-variant">
            Pregúntale al asistente: &quot;crea una clase Usuario&quot;, &quot;valida el
            diagrama&quot;, &quot;conecta Pedido con Cliente 1..*&quot;, etc.
          </p>
        )}
        {mensajes.map((m) => (
          <Mensaje key={m.id} entry={m} />
        ))}
        {pensando && (
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="font-code-sm text-code-sm text-on-surface-variant">
              Pensando y editando...
            </span>
          </div>
        )}
      </div>

      {pendingProposals && pendingProposals.length > 0 && (
        <PropuestaPendiente
          pending={pendingProposals}
          resumen={propuestaResumen}
          onAprobar={aprobarPropuesta}
          onDescartar={descartarPropuesta}
          readOnly={readOnly || pensando}
        />
      )}
      <div className="shrink-0 border-t border-outline-variant/60 px-3 py-2">
        <div className="mb-2 flex min-h-[16px] flex-wrap gap-1">
          <ToolRounds trace={pensando ? trace : []} pensando={pensando} />
        </div>
        {error && <p className="mb-2 font-code-sm text-code-sm text-error">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            disabled={pensando || readOnly || !!pendingProposals}
            placeholder={
              pendingProposals ? "Aprueba o descarta la propuesta pendiente" : readOnly ? "Solo lectura" : "Escribe una instrucción..."
            }
            className="max-h-32 min-h-[36px] flex-1 resize-y rounded-md border border-outline/60 bg-surface-container-low px-3 py-2 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant outline-none focus:border-primary disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!puedeEnviar}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary transition-opacity hover:bg-primary/90 disabled:opacity-40"
            title={modelo.trim() === "" ? "Elige un modelo primero" : "Enviar"}
          >
            {pensando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        {modelo.trim() === "" && !readOnly && (
          <p className="mt-1 font-code-sm text-code-sm text-on-surface-variant">
            <ChevronRight className="inline h-3 w-3" />
            Elige un modelo arriba para habilitar el envío.
          </p>
        )}
      </div>
    </aside>
  );
}