"use client";

import { useEffect } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { useDictadoVoz } from "@/hooks/useDictadoVoz";

interface BotonDictadoProps {
  /** Recibe la transcripción para insertarla en el campo del chat. */
  onTexto: (texto: string) => void;
  disabled?: boolean;
  title?: string;
  /** El chat de ayuda usa controles circulares. */
  redondo?: boolean;
  className?: string;
}

/**
 * Botón de dictado reutilizable por los tres chats (grupal, privado y ayuda).
 * La primera pulsación graba; la segunda detiene y transcribe.
 */
export function BotonDictado({
  onTexto,
  disabled = false,
  title = "Dictar mensaje por voz",
  redondo = false,
  className = "",
}: BotonDictadoProps) {
  const { solicitando, grabando, transcribiendo, error, alternar, limpiarError } =
    useDictadoVoz({ onTexto });

  // El aviso de error desaparece solo para no tapar el compositor.
  useEffect(() => {
    if (error === null) return;
    const timer = setTimeout(() => limpiarError(), 7000);
    return () => clearTimeout(timer);
  }, [error, limpiarError]);

  const etiqueta = grabando
    ? "Detener grabación y transcribir"
    : transcribiendo
      ? "Transcribiendo audio"
      : solicitando
        ? "Solicitando permiso del micrófono"
        : title;

  const bloqueado = transcribiendo || solicitando || (!grabando && disabled);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          limpiarError();
          alternar();
        }}
        disabled={bloqueado}
        aria-label={etiqueta}
        aria-pressed={grabando}
        title={error ?? etiqueta}
        className={`flex h-9 w-9 items-center justify-center border transition-colors disabled:opacity-40 ${
          redondo ? "rounded-full" : "rounded-md"
        } ${
          grabando
            ? "border-error bg-error/10 text-error"
            : "border-outline-variant/60 text-primary hover:bg-primary/10"
        } ${className}`}
      >
        {transcribiendo || solicitando ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : grabando ? (
          <Square className="h-3.5 w-3.5 fill-current" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </button>

      {error !== null && (
        <span
          role="status"
          className="absolute bottom-full right-0 z-20 mb-1 w-56 rounded-md border border-error/30 bg-surface px-2 py-1 font-code-sm text-code-sm text-error shadow-lg"
        >
          {error}
        </span>
      )}
    </div>
  );
}
