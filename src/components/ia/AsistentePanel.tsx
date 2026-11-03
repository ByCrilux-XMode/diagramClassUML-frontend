"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Loader2,
  Lock,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Save,
  Send,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useIAChat } from "@/hooks/useIAChat";
import type { ChatEntry } from "@/hooks/useIAChat";
import type { IAProvider } from "@/lib/ia/types";
import { guardarPlan, listarPlanes } from "@/lib/planes/api";
import type { Plan } from "@/lib/planes/api";
import { HF_USE_ROUTER } from "@/lib/ia/config";
import { formatearContexto, formatearPlanVigente } from "@/lib/ia/context/diagnostico";
import { formatearConformidad } from "@/lib/ia/conformidad";
import type { MensajeChat } from "@/lib/chat/api";
import { mencionaIA } from "@/lib/chat/mencion";
import { ChatGrupal } from "@/components/chat/ChatGrupal";
import { PanelActividad } from "@/components/actividad/PanelActividad";
import { PanelPropuestas } from "@/components/ia/PanelPropuestas";

export interface AsistentePanelProps {
  readOnly?: boolean;
  proyectoId?: string | null;
  usuarioId?: number;
  usuarioNombre?: string;
  rol?: string | null;
}

type Pestana = "chat" | "asistente" | "actividad";

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
      {entry.contexto && (
        <span
          className={`rounded px-1.5 py-0.5 font-code-sm text-code-sm ${
            formatearContexto(entry.contexto).degradado
              ? "bg-amber-100 text-amber-900"
              : "bg-surface-container-high text-on-surface-variant"
          }`}
          title={formatearContexto(entry.contexto).titulo}
        >
          {formatearContexto(entry.contexto).texto}
        </span>
      )}
      <ToolRounds trace={entry.trace} pensando={false} />
    </div>
  );
}


export default function AsistentePanel({
  readOnly = false,
  proyectoId = null,
  usuarioId,
  usuarioNombre = "Usuario",
  rol = null,
}: AsistentePanelProps) {
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
    resolviendoTurno,
    verificarSalud,
    cargarModelos,
    enviar,
    responderEnChat,
    aprobarTurno,
    rechazarTurno,
    reiniciar,
    setProyectoActivo,
    setContextoUsuario,
    modo,
    setModo,
    ambito,
    setAmbito,
    ultimoPlan,
    avisoFallback,
    conformidad,
    probandoConformidad,
    probarConformidad,
  } = useIAChat();

  const [abierto, setAbierto] = useState(true);
  const [pestana, setPestana] = useState<Pestana>("chat");
  const [turnoDestacado, setTurnoDestacado] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [confirmarPlan, setConfirmarPlan] = useState(false);
  const [guardandoPlan, setGuardandoPlan] = useState(false);
  const [avisoPlan, setAvisoPlan] = useState<string | null>(null);
  const [planVigente, setPlanVigente] = useState<Plan | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const puedeEditar = rol ? rol === "CREADOR" || rol === "EDITOR" : !readOnly;
  const usuarioChat = useMemo(
    () => ({ usuarioId: usuarioId ?? null, nombre: usuarioNombre }),
    [usuarioId, usuarioNombre],
  );
  const usarInputLibre = useMemo(() => modelos.length === 0, [modelos]);
  const badgeConformidad = useMemo(() => formatearConformidad(conformidad), [conformidad]);
  const clasesConformidad =
    conformidad?.estado === "verde"
      ? "bg-green-500/10 text-green-700"
      : conformidad?.estado === "amarillo"
        ? "bg-amber-lock/10 text-amber-lock"
        : conformidad?.estado === "rojo"
          ? "bg-error/10 text-error"
          : "bg-surface-container-low text-on-surface-variant";

  useEffect(() => {
    setProyectoActivo(proyectoId);
  }, [proyectoId, setProyectoActivo]);

  // D49: la interfaz muestra la versión vigente del plan, no solo el último
  // texto generado. El plan es del proyecto y cambia con otros colaboradores.
  useEffect(() => {
    let cancelado = false;
    setPlanVigente(null);
    if (!proyectoId) return;
    void listarPlanes(proyectoId, 1)
      .then(({ vigente }) => {
        if (!cancelado) setPlanVigente(vigente);
      })
      .catch(() => {
        if (!cancelado) setPlanVigente(null);
      });
    return () => {
      cancelado = true;
    };
  }, [proyectoId]);

  useEffect(() => {
    setContextoUsuario({ usuarioId: usuarioId ?? null, nombre: usuarioNombre, puedeEditar });
  }, [usuarioId, usuarioNombre, puedeEditar, setContextoUsuario]);

  // El ámbito guardado manda al abrir: si la última visita fue privada, se
  // abre la pestaña privada (D43). Se ajusta durante el render para
  // sincronizar con el estado que viene del store, sin efectos en cascada.
  const [ambitoAplicado, setAmbitoAplicado] = useState(ambito);
  if (ambito !== ambitoAplicado) {
    setAmbitoAplicado(ambito);
    if (ambito === "privado") setPestana("asistente");
  }

  const seleccionarAmbito = (siguiente: "grupo" | "privado") => {
    setAmbito(siguiente);
    setPestana(siguiente === "privado" ? "asistente" : "chat");
  };

  const guardarComoPlan = async () => {
    if (!proyectoId || !ultimoPlan || guardandoPlan) return;
    setGuardandoPlan(true);
    setAvisoPlan(null);
    try {
      const plan = await guardarPlan(proyectoId, { contenido: ultimoPlan, origen: "ia" });
      setPlanVigente(plan);
      setAvisoPlan(`Guardado como versión ${plan.version} del plan del proyecto.`);
      setConfirmarPlan(false);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setAvisoPlan(
        status === 403
          ? "Tu rol no puede guardar el plan del proyecto."
          : "No se pudo guardar el plan.",
      );
      setConfirmarPlan(false);
    } finally {
      setGuardandoPlan(false);
    }
  };

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

  // El turno se ejecuta en el cliente que envió el mensaje, después de que el
  // servidor lo haya persistido. Otros clientes solo lo ven llegar por SSE.
  const alMencionarIA = async (mensaje: MensajeChat) => {
    const contenido = (mensaje.contenido ?? "").trim();
    if (!proyectoId || !contenido || !mencionaIA(contenido)) return;
    await responderEnChat({
      proyectoId,
      prompt: contenido,
      puedeEditar,
      mensajeId: mensaje._id,
    });
  };

  const verDetalleDelTurno = (turnoId: string) => {
    setTurnoDestacado(turnoId);
    setPestana("actividad");
  };

  const puedeEnviar = !pensando && input.trim() !== "";

  const handleSend = () => {
    if (!puedeEnviar) return;
    const content = input;
    setInput("");
    void enviar(content);
  };

  if (!abierto) {
    return (
      <div className="flex h-full shrink-0 flex-col items-center border-l border-outline-variant/60 bg-surface">
        <button
          onClick={() => setAbierto(true)}
          className="flex h-full w-8 items-center justify-center text-on-surface-variant hover:bg-surface-container-low"
          title="Abrir panel de colaboración"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const propuesta = (
    <PanelPropuestas
      proyectoId={proyectoId}
      puedeEditar={puedeEditar}
      resolviendoTurno={resolviendoTurno}
      onAprobar={aprobarTurno}
      onRechazar={rechazarTurno}
    />
  );

  return (
    <aside className="flex h-full w-[340px] max-w-[90vw] shrink-0 flex-col border-l border-outline-variant/60 bg-surface">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-outline-variant/60 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </span>
          <span className="truncate font-class-name text-class-name text-on-surface">Colaboración</span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className={estatusClass(salud)} />
            <span className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
              {estatusLabel(salud, checking)}
            </span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
            title="Limpiar chat privado"
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

      <nav className="flex shrink-0 border-b border-outline-variant/60">
        <button
          onClick={() => seleccionarAmbito("grupo")}
          className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2 font-badge-label text-badge-label font-bold uppercase tracking-wider transition-colors ${
            pestana === "chat"
              ? "border-b-2 border-primary text-primary"
              : "border-b-2 border-transparent text-on-surface-variant hover:bg-surface-container-low"
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Grupal
        </button>
        <button
          onClick={() => seleccionarAmbito("privado")}
          className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2 font-badge-label text-badge-label font-bold uppercase tracking-wider transition-colors ${
            pestana === "asistente"
              ? "border-b-2 border-primary text-primary"
              : "border-b-2 border-transparent text-on-surface-variant hover:bg-surface-container-low"
          }`}
        >
          <Bot className="h-3.5 w-3.5" />
          Privado
        </button>
        <button
          onClick={() => setPestana("actividad")}
          className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2 font-badge-label text-badge-label font-bold uppercase tracking-wider transition-colors ${
            pestana === "actividad"
              ? "border-b-2 border-primary text-primary"
              : "border-b-2 border-transparent text-on-surface-variant hover:bg-surface-container-low"
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          Actividad
        </button>
      </nav>

      {pestana !== "actividad" && (
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
                <option value="hf-space">HF Space — modelo propio</option>
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
                  placeholder="ej. org/modelo"
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
          <div className="flex items-center justify-between gap-2">
            <span
              className={`rounded px-2 py-1 font-badge-label text-badge-label uppercase tracking-wider ${clasesConformidad}`}
              title={badgeConformidad.detalle}
            >
              {badgeConformidad.etiqueta}
            </span>
            <button
              onClick={() => void probarConformidad()}
              disabled={probandoConformidad || pensando || modelo.trim() === ""}
              className="flex items-center gap-1 rounded border border-outline/60 px-2 py-1 font-badge-label text-badge-label uppercase tracking-wider text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:opacity-50"
              title="Envía una petición fija con las herramientas reales para ver si el proveedor puede editar"
            >
              {probandoConformidad ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              {probandoConformidad ? "Probando…" : "Probar"}
            </button>
          </div>
          {avisoFallback && (
            <p className="font-code-sm text-code-sm text-amber-lock" role="status">
              {avisoFallback}
            </p>
          )}
        </div>
      )}

      {pestana !== "actividad" && (
        <div className="flex shrink-0 flex-col gap-1.5 border-b border-outline-variant/60 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
                Modo
              </span>
              {pestana === "asistente" ? (
                <span
                  className="flex items-center gap-1 rounded bg-surface-container-low px-2 py-1 font-badge-label text-badge-label text-on-surface"
                  title="Plan de solo lectura: puede consultar el diagrama, el plan y el historial, pero nunca modificarlo"
                >
                  <Lock className="h-3 w-3" />
                  Plan · solo lectura
                </span>
              ) : puedeEditar ? (
                <div className="flex items-center overflow-hidden rounded border border-outline/60">
                  <button
                    onClick={() => setModo("plan")}
                    disabled={pensando}
                    aria-pressed={modo === "plan"}
                    className={`px-2.5 py-1 font-badge-label text-badge-label uppercase tracking-wider transition-colors disabled:opacity-50 ${
                      modo === "plan"
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-low text-on-surface-variant hover:bg-surface"
                    }`}
                  >
                    Plan
                  </button>
                  <button
                    onClick={() => setModo("build")}
                    disabled={pensando}
                    aria-pressed={modo === "build"}
                    className={`px-2.5 py-1 font-badge-label text-badge-label uppercase tracking-wider transition-colors disabled:opacity-50 ${
                      modo === "build"
                        ? "bg-primary text-on-primary"
                        : "bg-surface-container-low text-on-surface-variant hover:bg-surface"
                    }`}
                  >
                    Build
                  </button>
                </div>
              ) : (
                <span className="rounded bg-surface-container-low px-2 py-1 font-badge-label text-badge-label uppercase tracking-wider text-on-surface-variant">
                  Solo consulta
                </span>
              )}
            </div>
            {ultimoPlan && puedeEditar && (
              <button
                onClick={() => {
                  if (confirmarPlan) void guardarComoPlan();
                  else {
                    setConfirmarPlan(true);
                    setAvisoPlan(null);
                  }
                }}
                onBlur={() => setConfirmarPlan(false)}
                disabled={guardandoPlan}
                className="flex items-center gap-1.5 rounded border border-primary/60 px-2 py-1 font-badge-label text-badge-label uppercase tracking-wider text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                title="Guarda la última respuesta de la IA como una versión nueva del plan del proyecto"
              >
                {guardandoPlan ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {guardandoPlan ? "Guardando…" : confirmarPlan ? "¿Confirmar?" : "Guardar plan"}
              </button>
            )}
          </div>
          <p className="font-code-sm text-code-sm text-on-surface-variant" title={planVigente?.contenido ?? ""}>
            {formatearPlanVigente(planVigente)}
          </p>
          {avisoPlan && (
            <p className="font-code-sm text-code-sm text-primary" role="status">
              {avisoPlan}
            </p>
          )}
        </div>
      )}

      {pestana === "chat" && (
        <>
          {error && (
            <p className="shrink-0 border-b border-outline-variant/60 px-3 py-1.5 font-code-sm text-code-sm text-error">
              {error}
            </p>
          )}
          {propuesta}
          <ChatGrupal
            proyectoId={proyectoId}
            usuario={usuarioChat}
            puedeEditar={puedeEditar}
            onMencionIA={alMencionarIA}
            onVerDetalle={verDetalleDelTurno}
          />
          {pensando && (
            <p className="flex shrink-0 items-center gap-2 border-t border-outline-variant/60 px-3 py-1.5 font-code-sm text-code-sm text-on-surface-variant">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              La IA está respondiendo en el chat…
            </p>
          )}
        </>
      )}

      {pestana === "asistente" && (
        <>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3" ref={scrollRef}>
            {mensajes.length === 0 && (
              <p className="font-body-md text-body-md text-on-surface-variant">
                Consulta privada sobre el diagrama: &quot;¿qué relaciones tiene Pedido?&quot;,
                &quot;valida el diagrama&quot;, &quot;¿qué falta para que sea coherente?&quot;.
                Usa las mismas herramientas de lectura que el chat grupal (estado del
                diagrama, validación, plan e historial), pero no puede editar. Para
                pedir cambios, menciónala con{" "}
                <span className="font-code-sm text-code-sm">@ia</span> en el chat grupal.
              </p>
            )}
            {mensajes.map((m) => (
              <Mensaje key={m.id} entry={m} />
            ))}
            {pensando && (
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span className="font-code-sm text-code-sm text-on-surface-variant">Consultando…</span>
              </div>
            )}
          </div>

          {propuesta}

          <div className="shrink-0 border-t border-outline-variant/60 px-3 py-2">
            <div className="mb-2 flex min-h-[16px] flex-wrap gap-1">
              <ToolRounds trace={pensando ? trace : []} pensando={pensando} />
            </div>
            {error && <p className="mb-2 font-code-sm text-code-sm text-error">{error}</p>}
            {!puedeEditar && (
              <p className="mb-2 font-code-sm text-code-sm text-amber-lock">
                Tu rol es LECTOR: puedes consultar, pero la IA no aplicará cambios.
              </p>
            )}
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
                disabled={pensando}
                placeholder="Pregunta sobre el diagrama…"
                className="max-h-32 min-h-[36px] flex-1 resize-y rounded-md border border-outline/60 bg-surface-container-low px-3 py-2 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant outline-none focus:border-primary disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={!puedeEnviar}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary transition-opacity hover:bg-primary/90 disabled:opacity-40"
                title={modelo.trim() === "" ? "Consultar con el modelo del tramo" : "Consultar"}
              >
                {pensando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
            {modelo.trim() === "" && (
              <p className="mt-1 font-code-sm text-code-sm text-on-surface-variant">
                Sin modelo elegido se usa el modelo por defecto del tramo.
              </p>
            )}
          </div>
        </>
      )}

      {pestana === "actividad" && (
        <PanelActividad
          proyectoId={proyectoId}
          turnoDestacado={turnoDestacado}
          onLimpiarDestacado={() => setTurnoDestacado(null)}
          puedeEditar={puedeEditar}
          usuarioId={usuarioId}
          usuarioNombre={usuarioNombre}
        />
      )}
    </aside>
  );
}
