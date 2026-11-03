"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Clock, Loader2, RefreshCw, Trash2, TriangleAlert, UserCheck } from "lucide-react";
import { usePropuestas } from "@/hooks/usePropuestas";
import type { EstadoPropuesta, TurnoPendiente } from "@/lib/propuestas/tipos";
import { ARRIENDO_PROPUESTA_MS } from "@/lib/propuestas/constantes";

export interface PanelPropuestasProps {
  proyectoId: string | null;
  puedeEditar: boolean;
  resolviendoTurno?: string | null;
  onAprobar: (turno: TurnoPendiente) => void | Promise<void>;
  onRechazar: (turno: TurnoPendiente) => void | Promise<void>;
}

function haceCuanto(iso: string, ahora: number): string {
  const fecha = new Date(iso).getTime();
  if (Number.isNaN(fecha)) return "";
  const segundos = Math.max(0, Math.round((ahora - fecha) / 1000));
  if (segundos < 60) return "hace instantes";
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return `hace ${dias} día(s)`;
}

function etiquetaEstado(estado: EstadoPropuesta): string {
  switch (estado) {
    case "pendiente":
      return "Pendiente";
    case "aprobando":
      return "Reclamado";
    case "aplicada":
      return "Aplicada";
    case "error":
      return "Con error";
    case "rechazada":
      return "Rechazada";
  }
}

function colorEstado(estado: EstadoPropuesta): string {
  switch (estado) {
    case "pendiente":
      return "bg-amber-100 text-amber-900";
    case "aprobando":
      return "bg-primary/10 text-primary";
    case "aplicada":
      return "bg-green-100 text-green-900";
    case "error":
      return "bg-error/10 text-error";
    case "rechazada":
      return "bg-surface-container-high text-on-surface-variant";
  }
}

function TurnoCard({
  turno,
  ahora,
  puedeEditar,
  resolviendo,
  onAprobar,
  onRechazar,
}: {
  turno: TurnoPendiente;
  ahora: number;
  puedeEditar: boolean;
  resolviendo: boolean;
  onAprobar: (turno: TurnoPendiente) => void | Promise<void>;
  onRechazar: (turno: TurnoPendiente) => void | Promise<void>;
}) {
  const resuelto =
    turno.estado === "aplicada" || turno.estado === "error" || turno.estado === "rechazada";
  const arriendoVencido =
    turno.estado === "aprobando" &&
    turno.reclamadaEn !== null &&
    ahora - new Date(turno.reclamadaEn).getTime() > ARRIENDO_PROPUESTA_MS;
  const reclamable = turno.estado === "pendiente" || arriendoVencido;

  return (
    <div className="rounded-md border border-outline-variant/60 bg-surface-container-low">
      <div className="flex flex-col gap-1 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
              {turno.solicitadoPor.nombre}
              {turno.modelo ? ` · ${turno.modelo}` : ""}
            </span>
            <span className="font-code-sm text-code-sm text-on-surface-variant">
              {turno.resumen}
            </span>
          </div>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 font-badge-label text-badge-label font-bold uppercase tracking-wider ${colorEstado(
              turno.estado,
            )}`}
          >
            {etiquetaEstado(turno.estado)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-code-sm text-code-sm text-on-surface-variant">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {haceCuanto(turno.creadoEn, ahora)}
          </span>
          <span>· {turno.propuestas.length} herramienta(s)</span>
          {turno.aprobadoPor && (
            <span className="flex items-center gap-1">
              <UserCheck className="h-3 w-3" />
              {turno.estado === "rechazada" ? "rechazada por" : "aprobada por"} {turno.aprobadoPor.nombre}
            </span>
          )}
        </div>

        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1 font-code-sm text-code-sm text-primary">
            <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
            Ver detalle
          </summary>
          <ul className="mt-1 flex flex-col gap-1">
            {turno.propuestas.map((propuesta) => (
              <li
                key={propuesta._id}
                className="break-words rounded bg-surface px-2 py-1 font-code-sm text-code-sm text-on-surface-variant"
              >
                <span className="font-bold text-on-surface">
                  R{propuesta.round + 1}:{propuesta.toolName}
                </span>
                <span className="mt-0.5 block whitespace-pre-wrap break-all">
                  {JSON.stringify(propuesta.args)}
                </span>
              </li>
            ))}
          </ul>
        </details>

        {turno.estado === "error" && turno.resultado && turno.resultado.errores.length > 0 && (
          <p className="flex items-start gap-1 font-code-sm text-code-sm text-error">
            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
            {turno.resultado.errores.join(" · ")}
          </p>
        )}

        {!resuelto && puedeEditar && (
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => void onAprobar(turno)}
              disabled={!reclamable || resolviendo}
              className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 font-badge-label text-badge-label font-bold text-on-primary hover:bg-primary/90 disabled:opacity-40"
            >
              {resolviendo ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Aprobar
            </button>
            <button
              onClick={() => void onRechazar(turno)}
              disabled={!reclamable || resolviendo}
              className="flex items-center gap-1 rounded border border-outline/60 bg-surface px-2.5 py-1 font-badge-label text-badge-label font-bold text-on-surface hover:bg-surface-container-low disabled:opacity-40"
            >
              <Trash2 className="h-3 w-3" />
              Rechazar
            </button>
            {turno.estado === "aprobando" && !arriendoVencido && (
              <span className="font-code-sm text-code-sm text-on-surface-variant">
                Reclamado por {turno.aprobadoPor?.nombre ?? "otra persona"}
              </span>
            )}
          </div>
        )}

        {!resuelto && !puedeEditar && (
          <p className="font-code-sm text-code-sm text-amber-lock">
            Tu rol es LECTOR: puedes leer la propuesta, pero no aprobarla.
          </p>
        )}

        {turno.estado === "pendiente" && (
          <p className="font-code-sm text-code-sm text-on-surface-variant">
            La vista previa fantasma solo existe en el navegador que pidió el turno.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Turnos propuestos por la IA, resueltos por cualquier EDITOR del proyecto.
 * La lista viene del servidor: sobrevive a la pestaña que pidió el cambio.
 */
export function PanelPropuestas({
  proyectoId,
  puedeEditar,
  resolviendoTurno = null,
  onAprobar,
  onRechazar,
}: PanelPropuestasProps) {
  const { turnos, cargando, error, cargar } = usePropuestas(proyectoId);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const intervalo = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(intervalo);
  }, []);

  const activos = turnos.filter(
    (turno) => turno.estado === "pendiente" || turno.estado === "aprobando",
  );
  const resueltos = turnos.filter(
    (turno) => turno.estado === "aplicada" || turno.estado === "error" || turno.estado === "rechazada",
  );

  if (!proyectoId) return null;

  return (
    <section className="mx-3 mb-2 flex shrink-0 flex-col gap-2 rounded-md border border-outline-variant/60 bg-surface p-2">
      <div className="flex items-center justify-between">
        <span className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
          Propuestas de la IA
        </span>
        <button
          onClick={() => void cargar()}
          disabled={cargando}
          className="rounded p-1 text-on-surface-variant hover:bg-surface-container-low disabled:opacity-50"
          title="Recargar propuestas"
        >
          <RefreshCw className={`h-3 w-3 ${cargando ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && <p className="font-code-sm text-code-sm text-error">{error}</p>}
      {cargando && turnos.length === 0 && (
        <p className="flex items-center gap-1 font-code-sm text-code-sm text-on-surface-variant">
          <Loader2 className="h-3 w-3 animate-spin" />
          Cargando propuestas…
        </p>
      )}
      {!cargando && activos.length === 0 && (
        <p className="font-code-sm text-code-sm text-on-surface-variant">
          No hay propuestas pendientes.
        </p>
      )}

      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
        {activos.map((turno) => (
          <TurnoCard
            key={turno.turnoId}
            turno={turno}
            ahora={ahora}
            puedeEditar={puedeEditar}
            resolviendo={resolviendoTurno === turno.turnoId}
            onAprobar={onAprobar}
            onRechazar={onRechazar}
          />
        ))}
      </div>

      {resueltos.length > 0 && (
        <details>
          <summary className="cursor-pointer font-code-sm text-code-sm text-on-surface-variant">
            Resueltas recientes ({resueltos.length})
          </summary>
          <div className="mt-1 flex max-h-40 flex-col gap-2 overflow-y-auto">
            {resueltos.slice().reverse().map((turno) => (
              <TurnoCard
                key={turno.turnoId}
                turno={turno}
                ahora={ahora}
                puedeEditar={false}
                resolviendo={false}
                onAprobar={onAprobar}
                onRechazar={onRechazar}
              />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
