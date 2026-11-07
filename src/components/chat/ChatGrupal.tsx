"use client";

import { useEffect, useRef, useState } from "react";
import { AtSign, Bot, Loader2, Send, TriangleAlert } from "lucide-react";
import { useChat } from "@/hooks/useChat";
import type { UsuarioChat } from "@/hooks/useChat";
import type { MensajeChat } from "@/lib/chat/api";
import { insertarMencion } from "@/lib/chat/mencion";
import { insertarDictado } from "@/lib/ia/stt";
import { BotonDictado } from "./BotonDictado";
import { TarjetaSuceso } from "./TarjetaSuceso";

interface ChatGrupalProps {
  proyectoId: string | null;
  usuario: UsuarioChat;
  puedeEditar: boolean;
  onMencionIA: (mensaje: MensajeChat) => void | Promise<void>;
  onVerDetalle?: (turnoId: string) => void;
}

function hora(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return fecha.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

function MensajeFila({
  mensaje,
  propio,
  onVerDetalle,
}: {
  mensaje: MensajeChat;
  propio: boolean;
  onVerDetalle?: (turnoId: string) => void;
}) {
  if (mensaje.tipo === "suceso") {
    return (
      <div className="flex flex-col gap-1">
        <TarjetaSuceso mensaje={mensaje} onVerDetalle={onVerDetalle} />
        <span className="px-1 font-code-sm text-code-sm text-on-surface-variant">{hora(mensaje.creadoEn)}</span>
      </div>
    );
  }

  const esIA = mensaje.autorTipo === "ia";
  return (
    <div className={`flex flex-col gap-1 ${propio ? "items-end" : "items-start"}`}>
      <div className="flex items-center gap-1.5 px-1">
        {esIA && <Bot className="h-3.5 w-3.5 text-primary" />}
        <span className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
          {esIA ? "IA" : mensaje.autorNombre}
        </span>
        {esIA && mensaje.modelo && (
          <span className="font-code-sm text-code-sm text-on-surface-variant">· {mensaje.modelo}</span>
        )}
        <span className="font-code-sm text-code-sm text-on-surface-variant">· {hora(mensaje.creadoEn)}</span>
      </div>
      <p
        className={`max-w-[92%] whitespace-pre-wrap break-words rounded-md px-3 py-2 font-body-md text-body-md ${
          esIA
            ? "border border-outline-variant/60 bg-surface-container-low text-on-surface"
            : propio
              ? "bg-primary/10 text-on-surface"
              : "bg-surface-container-high text-on-surface"
        }`}
      >
        {mensaje.contenido}
      </p>
    </div>
  );
}

export function ChatGrupal({ proyectoId, usuario, puedeEditar, onMencionIA, onVerDetalle }: ChatGrupalProps) {
  const { mensajes, cargando, cargandoMas, enviando, error, hayMas, enviar, cargarMas } = useChat({
    proyectoId,
    usuario,
    puedeEditar,
    onMencionIA,
  });
  const [texto, setTexto] = useState("");
  const listaRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = listaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensajes, enviando]);

  const enviarActual = async () => {
    const contenido = texto.trim();
    if (!contenido || enviando) return;
    setTexto("");
    await enviar(contenido);
    areaRef.current?.focus();
  };

  const insertarIa = () => {
    const area = areaRef.current;
    const cursor = area?.selectionStart ?? texto.length;
    const resultado = insertarMencion(texto, cursor);
    setTexto(resultado.texto);
    requestAnimationFrame(() => {
      if (!area) return;
      area.focus();
      area.setSelectionRange(resultado.cursor, resultado.cursor);
    });
  };

  const aplicarDictado = (dictado: string) => {
    const area = areaRef.current;
    const cursor = area?.selectionStart ?? texto.length;
    const resultado = insertarDictado(texto, dictado, cursor);
    setTexto(resultado.texto);
    requestAnimationFrame(() => {
      if (!area) return;
      area.focus();
      area.setSelectionRange(resultado.cursor, resultado.cursor);
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={listaRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
        {hayMas && (
          <button
            onClick={() => void cargarMas()}
            disabled={cargandoMas}
            className="self-center rounded border border-outline-variant/60 px-2 py-1 font-code-sm text-code-sm text-on-surface-variant hover:bg-surface-container-low disabled:opacity-50"
          >
            {cargandoMas ? "Cargando..." : "Cargar mensajes anteriores"}
          </button>
        )}
        {cargando && mensajes.length === 0 && (
          <div className="flex items-center gap-2 text-on-surface-variant">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="font-code-sm text-code-sm">Cargando conversación...</span>
          </div>
        )}
        {!cargando && mensajes.length === 0 && (
          <p className="font-body-md text-body-md text-on-surface-variant">
            Todavía no hay mensajes. Escribe algo o menciona a la IA con <span className="font-code-sm">@ia</span>{" "}
            para pedirle un cambio.
          </p>
        )}
        {mensajes.map((mensaje) => (
          <MensajeFila
            key={mensaje._id}
            mensaje={mensaje}
            propio={mensaje.autorTipo === "humano" && mensaje.autorUsuarioId === usuario.usuarioId}
            onVerDetalle={onVerDetalle}
          />
        ))}
        {enviando && (
          <div className="flex items-center gap-2 text-on-surface-variant">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="font-code-sm text-code-sm">Enviando...</span>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-outline-variant/60 px-3 py-2">
        {error && (
          <p className="mb-2 flex items-start gap-1 font-code-sm text-code-sm text-error">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
        {!puedeEditar && (
          <p className="mb-2 font-code-sm text-code-sm text-amber-lock">
            Tu rol es LECTOR: puedes conversar y consultar, pero la IA no aplicará cambios.
          </p>
        )}
        <div className="flex items-end gap-2">
          <button
            onClick={insertarIa}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-outline-variant/60 text-primary hover:bg-primary/10"
            title="Mencionar a la IA"
          >
            <AtSign className="h-4 w-4" />
          </button>
          <BotonDictado
            onTexto={aplicarDictado}
            disabled={enviando}
            title="Dictar mensaje al grupo"
          />
          <textarea
            ref={areaRef}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === "Enter" && !evento.shiftKey) {
                evento.preventDefault();
                void enviarActual();
              }
            }}
            rows={1}
            placeholder="Escribe al grupo… usa @ia para invocar al asistente"
            className="max-h-32 min-h-[36px] flex-1 resize-y rounded-md border border-outline/60 bg-surface-container-low px-3 py-2 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant outline-none focus:border-primary"
          />
          <button
            onClick={() => void enviarActual()}
            disabled={enviando || texto.trim() === ""}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-40"
            title="Enviar mensaje"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
