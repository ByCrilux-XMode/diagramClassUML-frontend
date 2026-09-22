"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle, Search, Send, X, Sparkles, ChevronRight, Loader2, Download, WifiOff } from "lucide-react";
import { HELP_ENTRIES, searchHelp, detectQuickIntent, type HelpEntry, type QuickIntent } from "@/lib/ayuda/knowledge";
import { useHelpActions } from "@/lib/helpActions";
import { useAuth, type ProyectoItem } from "@/hooks/useAuth";

type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  entries?: HelpEntry[];
  projects?: ProyectoItem[];
  notice?: string;
};

interface HelpAiPayload {
  intent: "open_create_modal" | "open_project" | "download_backend" | "explain";
  text: string;
  projectId: number | null;
  helpIds: string[];
  keyFallbacksUsed?: number;
}

let msgSeq = 0;
function nextMsgId(): string {
  msgSeq += 1;
  return `msg-${Date.now()}-${msgSeq}`;
}

function Inline({ text }: { text: string }) {
  const re = /(\*\*.*?\*\*|`[^`]+`)/g;
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
          return (
            <strong key={i} className="font-semibold text-on-surface">
              {p.slice(2, -2)}
            </strong>
          );
        }
        if (p.startsWith("`") && p.endsWith("`") && p.length > 2) {
          return (
            <code key={i} className="rounded bg-surface-variant px-1 py-0.5 font-mono text-[12px] text-on-surface">
              {p.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function HelpMarkdown({ text }: { text: string }) {
  // Separa bloques ```code```
  const fenceParts = text.split(/```/);
  return (
    <div className="flex flex-col gap-2">
      {fenceParts.map((part, idx) => {
        if (idx % 2 === 1) {
          // bloque de código
          const lines = part.split("\n");
          // quita primera línea si es lenguaje (json, etc)
          const first = lines[0]?.trim().toLowerCase();
          const isLang = ["json", "bash", "js", "ts"].includes(first);
          const code = isLang ? lines.slice(1).join("\n").trim() : part.trim();
          return (
            <pre key={idx} className="overflow-x-auto rounded bg-surface-variant p-2 font-mono text-[11px] leading-4 text-on-surface">
              <code>{code}</code>
            </pre>
          );
        }
        // texto normal: agrupar listas y párrafos
        const lines = part.split("\n");
        const blocks: React.ReactNode[] = [];
        let listItems: string[] = [];
        let listType: "ol" | "ul" | null = null;
        const flushList = () => {
          if (listItems.length === 0 || !listType) return;
          const items = [...listItems];
          const t = listType;
          listItems = [];
          listType = null;
          blocks.push(
            t === "ol" ? (
              <ol key={blocks.length} className="list-decimal space-y-1 pl-5">
                {items.map((it, j) => (
                  <li key={j} className="font-body-md text-body-md text-on-surface">
                    <Inline text={it} />
                  </li>
                ))}
              </ol>
            ) : (
              <ul key={blocks.length} className="list-disc space-y-1 pl-5">
                {items.map((it, j) => (
                  <li key={j} className="font-body-md text-body-md text-on-surface">
                    <Inline text={it} />
                  </li>
                ))}
              </ul>
            ),
          );
        };
        lines.forEach((raw) => {
          const line = raw.trim();
          if (!line) {
            flushList();
            return;
          }
          const ol = line.match(/^\d+\.\s+(.*)/);
          if (ol) {
            if (listType !== "ol") {
              flushList();
              listType = "ol";
            }
            listItems.push(ol[1]);
            return;
          }
          const ul = line.match(/^[-•]\s+(.*)/);
          if (ul) {
            if (listType !== "ul") {
              flushList();
              listType = "ul";
            }
            listItems.push(ul[1]);
            return;
          }
          flushList();
          blocks.push(
            <p key={blocks.length} className="font-body-md text-body-md leading-5 text-on-surface">
              <Inline text={line} />
            </p>,
          );
        });
        flushList();
        return <div key={idx} className="flex flex-col gap-2">{blocks}</div>;
      })}
    </div>
  );
}

export default function HelpAssistant() {
  const router = useRouter();
  const openCreateModal = useHelpActions((s) => s.openCreateModal);
  const openExportModal = useHelpActions((s) => s.openExportModal);
  const proyectos = useAuth((s) => s.proyectos);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      text: "¡Hola! Soy tu asistente de **/proyectos**. Dime cosas como **\"crea un proyecto\"** (lo abro al instante), **\"quiero crear un proyecto\"**, **\"cómo descargo el backend\"** o **\"abre veterinaria\"**. También puedes tocar un atajo o buscar un tema.",
    },
  ]);
  const [selected, setSelected] = useState<HelpEntry | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [iaOnline, setIaOnline] = useState<boolean | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const chips = useMemo(() => {
    const all = HELP_ENTRIES.flatMap((e) => e.atajos ?? []);
    return Array.from(new Set(all)).slice(0, 8);
  }, []);

  const filtered = useMemo(() => (query.trim() ? searchHelp(query, 6) : HELP_ENTRIES.slice(0, 6)), [query]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [msgs, selected, aiBusy]);

  useEffect(() => {
    if (!open || iaOnline !== null) return;
    fetch("/api/ia/health?provider=openrouter")
      .then((r) => r.json().catch(() => ({ ok: false })))
      .then((d) => setIaOnline(d.ok === true))
      .catch(() => setIaOnline(false));
  }, [open, iaOnline]);

  const pushAssistant = (msg: Omit<Msg, "id" | "role">) => {
    setMsgs((m) => [...m, { id: nextMsgId(), role: "assistant", ...msg }]);
  };

  const entriesFromIds = (ids: string[]): HelpEntry[] =>
    ids
      .map((id) => HELP_ENTRIES.find((e) => e.id === id))
      .filter((e): e is HelpEntry => Boolean(e));

  // ─── Intención local (rápida y determinista) ────────────────────────────
  const ejecutarQuickIntent = (q: QuickIntent) => {
    if (q.intent === "open_create_modal") {
      openCreateModal();
      pushAssistant({
        text: "¡Listo! Te abro el modal de **Nuevo Proyecto**.\nPonle un nombre sin tildes ni espacios (ej. `veterinaria`), elige *empezar en blanco* y pulsa **Crear y abrir diagrama**.",
        entries: [HELP_ENTRIES.find((e) => e.id === "crear-proyecto")!],
      });
      return;
    }
    if (q.intent === "download_backend") {
      if (q.projectId && proyectos.some((p) => p.proyectoId === q.projectId)) {
        openExportModal({ proyectoId: q.projectId, nombre: q.projectName ?? "" });
        pushAssistant({
          text: `Te abrí la **descarga del backend** de \`${q.projectName}\`.\nRevisa el preview (entidades/FK) y pulsa **Descargar ZIP**.`,
          entries: [HELP_ENTRIES.find((e) => e.id === "exportar-backend")!],
        });
      } else {
        respuestaDescargaSinDestino();
      }
      return;
    }
    if (q.intent === "open_project") {
      router.push(`/editor/${q.projectId}`);
      pushAssistant({
        text: `Abriendo **${q.projectName}** en el editor...`,
      });
      return;
    }
  };

  const respuestaDescargaSinDestino = () => {
    const top = HELP_ENTRIES.find((e) => e.id === "exportar-backend");
    pushAssistant({
      text: `Voy a ayudarte con la **descarga del backend**. Este es el camino:\n${top?.respuesta ?? ""}\nY si quieres, dímelo concreto (*\"descarga veterinaria\"*) o elige abajo de qué proyecto te abro la descarga directa:`,
      entries: proyectos.length > 0 ? undefined : [],
      projects: proyectos.length > 0 ? proyectos : undefined,
    });
  };

  // ─── Intención devuelta por la IA (OpenRouter) ──────────────────────────
  const ejecutarAiIntent = (data: HelpAiPayload) => {
    const entries = entriesFromIds(data.helpIds ?? []);

    if (data.intent === "open_create_modal") {
      openCreateModal();
      pushAssistant({ text: data.text || "Te abro el modal de **Nuevo Proyecto**.", entries });
      return;
    }
    if (data.intent === "download_backend") {
      const objetivo =
        data.projectId !== null
          ? proyectos.find((p) => p.proyectoId === data.projectId)
          : undefined;
      if (objetivo) {
        openExportModal({ proyectoId: objetivo.proyectoId, nombre: objetivo.nombre });
        pushAssistant({ text: data.text || `Te abro la descarga de \`${objetivo.nombre}\`.`, entries });
      } else {
        respuestaDescargaSinDestino();
      }
      return;
    }
    if (data.intent === "open_project") {
      const objetivo = proyectos.find((p) => p.proyectoId === data.projectId);
      if (objetivo) {
        router.push(`/editor/${objetivo.proyectoId}`);
        pushAssistant({ text: data.text || `Abriendo **${objetivo.nombre}**...`, entries });
      } else {
        pushAssistant({ text: data.text || "Selecciona un proyecto para abrir.", entries });
      }
      return;
    }
    // explain
    pushAssistant({ text: data.text || "Te cuento cómo hacerlo.", entries });
  };

  // ─── Fallback local (sin OpenRouter / sin red) ───────────────────────────
  const respuestaLocal = (text: string) => {
    const hits = searchHelp(text, 3);
    if (hits.length === 0) {
      pushAssistant({
        text: "No encontré coincidencia exacta en la guía local. Prueba con: *crear proyecto, descargar backend, /api/schema, IA, voz offline* — o elige un tema abajo.",
        notice: "Asistente online no disponible (OpenRouter) — usando guía local.",
        entries: HELP_ENTRIES.slice(0, 3),
      });
      return;
    }
    const top = hits[0];
    const rest = hits.slice(1);
    setSelected(top);
    pushAssistant({
      text: `Encontré **${hits.length}** tema(s) para *"${text}"*. Te muestro el más relevante: **${top.titulo}**.`,
      notice: "Asistente online no disponible (OpenRouter) — usando guía local.",
      entries: rest,
    });
  };

  const pushUser = async (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;
    setMsgs((m) => [...m, { id: nextMsgId(), role: "user", text }]);

    // 1) Órdenes fuertes y deterministas: respuesta al instante, sin red.
    const quick = detectQuickIntent(text, proyectos);
    if (quick) {
      ejecutarQuickIntent(quick);
      return;
    }

    // 2) IA online (OpenRouter, con fallback de hasta 3 keys en el servidor).
    setAiBusy(true);
    try {
      const res = await fetch("/api/ia/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: text }],
          projects: proyectos,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<HelpAiPayload> & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No disponible.");
      ejecutarAiIntent({
        intent: data.intent ?? "explain",
        text: data.text ?? "",
        projectId: data.projectId ?? null,
        helpIds: data.helpIds ?? [],
      });
    } catch {
      // 3) Sin OpenRouter/red → guía local existente.
      respuestaLocal(text);
    } finally {
      setAiBusy(false);
    }
  };

  const handleSend = () => {
    const t = query.trim();
    if (!t || aiBusy) return;
    setQuery("");
    void pushUser(t);
  };

  const handleChip = (chip: string) => {
    setQuery(chip);
    void pushUser(chip);
  };

  const handlePick = (e: HelpEntry) => {
    setSelected(e);
    setMsgs((m) => [...m, { id: nextMsgId(), role: "assistant", text: `**${e.titulo}**`, entries: [] }]);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border border-outline-variant bg-primary px-4 py-3 text-on-primary shadow-[0_4px_16px_rgba(0,0,0,0.18)] hover:bg-primary/90"
        aria-label="Abrir ayuda"
      >
        <HelpCircle className="h-5 w-5" />
        <span className="hidden font-badge-label text-badge-label font-bold sm:inline">Ayuda</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[min(72vh,560px)] w-[min(92vw,380px)] flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-[0_8px_32px_rgba(0,0,0,0.22)]">
      <header className="flex items-center justify-between border-b border-outline-variant/50 bg-surface-container-low px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
            {iaOnline ? <Sparkles className="h-4 w-4 text-primary" /> : <WifiOff className="h-4 w-4 text-on-surface-variant" />}
          </span>
          <div>
            <p className="font-class-name text-class-name font-bold text-on-surface">Ayuda</p>
            <p className="font-code-sm text-[11px] text-on-surface-variant">
              {iaOnline === null
                ? "Comprobando asistente..."
                : iaOnline
                  ? "Asistente IA · OpenRouter fuction calling"
                  : "Respuestas locales — sin internet"}
            </p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} className="rounded p-1.5 text-on-surface-variant hover:bg-surface-variant" aria-label="Cerrar">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto bg-surface px-3 py-3">
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c}
              onClick={() => handleChip(c)}
              disabled={aiBusy}
              className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 font-code-sm text-[11px] text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {msgs.map((m) => (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={m.role === "user" ? "max-w-[84%] rounded-2xl bg-primary px-3 py-2 font-body-md text-body-md text-on-primary" : "max-w-[92%] rounded-2xl border border-outline-variant/50 bg-surface-container-low px-3 py-2 font-body-md text-body-md text-on-surface"}>
                <span className="break-words">
                  {m.role === "user" ? m.text : <Inline text={m.text} />}
                </span>

                {m.projects && m.projects.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    <p className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
                      ¿De qué proyecto descargo?
                    </p>
                    {m.projects.map((p) => (
                      <button
                        key={p.proyectoId}
                        onClick={() => openExportModal({ proyectoId: p.proyectoId, nombre: p.nombre })}
                        className="flex items-center justify-between rounded border border-outline-variant bg-surface px-2.5 py-2 text-left hover:bg-surface-variant"
                      >
                        <span className="font-code-sm text-code-sm font-medium text-on-surface">{p.nombre}</span>
                        <Download className="h-3.5 w-3.5 text-primary" />
                      </button>
                    ))}
                  </div>
                )}

                {m.notice && (
                  <p className="mt-2 flex items-center gap-1 font-code-sm text-[11px] text-on-surface-variant">
                    <WifiOff className="h-3 w-3" />
                    {m.notice}
                  </p>
                )}

                {m.entries && m.entries.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {m.entries.map((e) => (
                      <button key={e.id} onClick={() => handlePick(e)} className="flex items-center justify-between rounded border border-outline-variant bg-surface px-2.5 py-2 text-left hover:bg-surface-variant">
                        <span className="font-code-sm text-code-sm font-medium text-on-surface">{e.titulo}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-on-surface-variant" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {aiBusy && (
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              </span>
              <span className="font-code-sm text-code-sm text-on-surface-variant">Pensando en OpenRouter...</span>
            </div>
          )}
        </div>

        {selected && (
          <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="font-class-name text-class-name font-bold text-on-surface">{selected.titulo}</p>
            <p className="mt-1 font-code-sm text-[11px] text-on-surface-variant">{selected.pregunta}</p>
            <div className="mt-2">
              <HelpMarkdown text={selected.respuesta} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {selected.keywords.slice(0, 5).map((k) => (
                <span key={k} className="rounded bg-surface px-1.5 py-0.5 font-code-sm text-[10px] text-on-surface-variant">
                  #{k}
                </span>
              ))}
            </div>
          </div>
        )}

        {!selected && query.trim() === "" && (
          <div className="mt-3 flex flex-col gap-1">
            <p className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">Temas</p>
            {HELP_ENTRIES.slice(0, 8).map((e) => (
              <button key={e.id} onClick={() => handlePick(e)} className="flex items-center justify-between rounded border border-outline-variant/50 bg-surface-container-low px-3 py-2 text-left hover:bg-surface-variant">
                <span className="font-code-sm text-code-sm text-on-surface">{e.titulo}</span>
                <ChevronRight className="h-3.5 w-3.5 text-on-surface-variant" />
              </button>
            ))}
          </div>
        )}

        {query.trim() !== "" && !selected && (
          <div className="mt-3 flex flex-col gap-1">
            <p className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">Resultados para “{query}”</p>
            {filtered.length === 0 ? (
              <p className="font-body-md text-body-md text-on-surface-variant">Sin resultados. Prueba: crear proyecto, descargar, IA, schema.</p>
            ) : (
              filtered.map((e) => (
                <button key={e.id} onClick={() => handlePick(e)} className="flex flex-col items-start rounded border border-outline-variant/50 bg-surface-container-low px-3 py-2 text-left hover:bg-surface-variant">
                  <span className="font-code-sm text-code-sm font-bold text-on-surface">{e.titulo}</span>
                  <span className="font-code-sm text-[11px] text-on-surface-variant">{e.pregunta}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="border-t border-outline-variant/50 bg-surface-container-low px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (selected) setSelected(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
                if (e.key === "Escape") setSelected(null);
              }}
              placeholder="Pregunta: cómo creo un proyecto..."
              disabled={aiBusy}
              className="w-full rounded-full border border-outline-variant bg-surface py-2 pl-8 pr-3 font-body-md text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
          </div>
          <button onClick={handleSend} disabled={aiBusy || !query.trim()} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50" aria-label="Enviar">
            {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        {selected && (
          <button onClick={() => setSelected(null)} className="mt-2 font-code-sm text-[11px] text-primary hover:underline">
            ← Volver a la lista
          </button>
        )}
      </div>
    </div>
  );
}