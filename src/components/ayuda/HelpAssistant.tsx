"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HelpCircle, Search, Send, X, Sparkles, ChevronRight } from "lucide-react";
import { HELP_ENTRIES, searchHelp, type HelpEntry } from "@/lib/ayuda/knowledge";

type Msg = { id: string; role: "user" | "assistant"; text: string; entries?: HelpEntry[] };

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export default function HelpAssistant() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      text: "¡Hola! Soy tu asistente de **/proyectos**. Pregúntame *cómo crear un proyecto, descargar el backend, usar la IA, /api/schema, voz offline*... También puedes tocar un atajo.",
    },
  ]);
  const [selected, setSelected] = useState<HelpEntry | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const chips = useMemo(() => {
    const all = HELP_ENTRIES.flatMap((e) => e.atajos ?? []);
    return Array.from(new Set(all)).slice(0, 8);
  }, []);

  const filtered = useMemo(() => (query.trim() ? searchHelp(query, 6) : HELP_ENTRIES.slice(0, 6)), [query]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [msgs, selected]);

  const pushUser = (text: string) => {
    const id = Date.now().toString();
    setMsgs((m) => [...m, { id, role: "user", text }]);
    const hits = searchHelp(text, 3);
    if (hits.length === 0) {
      setMsgs((m) => [...m, { id: id + "-a", role: "assistant", text: "No encontré coincidencia exacta. Prueba con: *crear proyecto, descargar backend, /api/schema, IA, voz offline* — o elige un tema abajo.", entries: HELP_ENTRIES.slice(0, 3) }]);
      return;
    }
    // si hay match fuerte, mostrar el top 1 expandido + resto como sugerencias
    const top = hits[0];
    const rest = hits.slice(1);
    setSelected(top);
    setMsgs((m) => [...m, { id: id + "-a", role: "assistant", text: `Encontré **${hits.length}** tema(s) para *"${text}"*. Te muestro el más relevante: **${top.titulo}**.`, entries: rest }]);
  };

  const handleSend = () => {
    const t = query.trim();
    if (!t) return;
    setQuery("");
    pushUser(t);
  };

  const handleChip = (chip: string) => {
    setQuery(chip);
    pushUser(chip);
  };

  const handlePick = (e: HelpEntry) => {
    setSelected(e);
    setMsgs((m) => [...m, { id: Date.now().toString(), role: "assistant", text: `**${e.titulo}**`, entries: [] }]);
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
            <Sparkles className="h-4 w-4 text-primary" />
          </span>
          <div>
            <p className="font-class-name text-class-name font-bold text-on-surface">Ayuda</p>
            <p className="font-code-sm text-[11px] text-on-surface-variant">Respuestas locales — sin internet</p>
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
              className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 font-code-sm text-[11px] text-primary hover:bg-primary/10"
            >
              {c}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {msgs.map((m) => (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={m.role === "user" ? "max-w-[84%] rounded-2xl bg-primary px-3 py-2 font-body-md text-body-md text-on-primary" : "max-w-[92%] rounded-2xl border border-outline-variant/50 bg-surface-container-low px-3 py-2 font-body-md text-body-md text-on-surface"}>
                <span className="whitespace-pre-wrap break-words">{m.text}</span>
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
        </div>

        {selected && (
          <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="font-class-name text-class-name font-bold text-on-surface">{selected.titulo}</p>
            <p className="mt-1 font-code-sm text-[11px] text-on-surface-variant">{selected.pregunta}</p>
            <p className="mt-2 whitespace-pre-wrap break-words font-body-md text-body-md text-on-surface">{selected.respuesta}</p>
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
              className="w-full rounded-full border border-outline-variant bg-surface py-2 pl-8 pr-3 font-body-md text-body-md outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <button onClick={handleSend} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary hover:bg-primary/90" aria-label="Enviar">
            <Send className="h-4 w-4" />
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
