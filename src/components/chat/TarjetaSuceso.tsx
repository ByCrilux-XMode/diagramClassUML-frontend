"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import type { MensajeChat } from "@/lib/chat/api";

interface TarjetaSucesoProps {
  mensaje: MensajeChat;
  onVerDetalle?: (turnoId: string) => void;
}

/** El texto visible se deriva del hecho estructurado, no se guarda congelado. */
export function TarjetaSuceso({ mensaje, onVerDetalle }: TarjetaSucesoProps) {
  const suceso = mensaje.suceso;
  if (!suceso) return null;

  const aplicada = suceso.tipo === "propuesta.aplicada";
  const Icono = aplicada ? CheckCircle2 : XCircle;
  const titulo = aplicada
    ? `${suceso.actor.nombre} aplicó ${suceso.cambios} cambio(s)`
    : `${suceso.actor.nombre} descartó ${suceso.cambios} cambio(s)`;

  return (
    <div className="rounded-md border border-outline-variant/70 bg-surface-container-low px-3 py-2">
      <div className="flex items-start gap-2">
        <Icono className={`mt-0.5 h-4 w-4 shrink-0 ${aplicada ? "text-primary" : "text-amber-lock"}`} />
        <div className="min-w-0 flex-1">
          <p className="font-body-md text-body-md text-on-surface">
            {aplicada ? "Propuesta aplicada" : "Propuesta descartada"}
          </p>
          <p className="font-code-sm text-code-sm text-on-surface-variant">{titulo}</p>
          {suceso.errores.length > 0 && (
            <p className="mt-1 break-words font-code-sm text-code-sm text-error">
              {suceso.errores.join("; ")}
            </p>
          )}
          {onVerDetalle && (
            <button
              onClick={() => onVerDetalle(suceso.turnoId)}
              className="mt-1 font-code-sm text-code-sm text-primary underline-offset-2 hover:underline"
            >
              Ver detalle en actividad
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
