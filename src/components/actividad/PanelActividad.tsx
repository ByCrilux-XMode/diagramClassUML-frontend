"use client";

import { Fragment, useEffect, useState } from "react";
import {
  ChevronDown,
  History,
  Loader2,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
import { useActividad } from "@/hooks/useActividad";
import { useReversion } from "@/hooks/useReversion";
import { formatearElegibilidadReversion } from "@/lib/actividad/reversion";
import { agruparEventos } from "@/lib/actividad/agrupar";
import type { TipoFilaActividad } from "@/lib/actividad/agrupar";
import type { EventoApi } from "@/lib/actividad/api";
import { FilaEvento, FilaGrupo } from "./FilaActividad";

const ACTORES = [
  { valor: "", etiqueta: "Todos" },
  { valor: "humano", etiqueta: "Personas" },
  { valor: "ia", etiqueta: "IA" },
  { valor: "sistema", etiqueta: "Sistema" },
] as const;

const TIPOS = [
  { valor: "", etiqueta: "Todas las acciones" },
  { valor: "clase.crear", etiqueta: "Clases creadas" },
  { valor: "clase.actualizar", etiqueta: "Clases modificadas" },
  { valor: "clase.eliminar", etiqueta: "Clases eliminadas" },
  { valor: "relacion.crear", etiqueta: "Relaciones creadas" },
  { valor: "relacion.actualizar", etiqueta: "Relaciones modificadas" },
  { valor: "relacion.eliminar", etiqueta: "Relaciones eliminadas" },
  { valor: "mixto", etiqueta: "Cambios mixtos" },
] as const;

type ActorTipo = (typeof ACTORES)[number]["valor"];

interface PanelActividadProps {
  proyectoId: string | null;
  turnoDestacado?: string | null;
  onLimpiarDestacado?: () => void;
  /** Fase 9: solo CREADOR y EDITOR pueden deshacer el último turno de la IA. */
  puedeEditar?: boolean;
  usuarioId?: number;
  usuarioNombre?: string;
}

function fechaDeFila(fila: TipoFilaActividad<EventoApi>): string {
  return fila.tipo === "grupo" ? (fila.eventos[0]?.creadoEn ?? "") : fila.evento.creadoEn;
}

function claveDia(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return `${fecha.getFullYear()}-${fecha.getMonth()}-${fecha.getDate()}`;
}

function etiquetaDia(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  const mismoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (mismoDia(fecha, hoy)) return "Hoy";
  if (mismoDia(fecha, ayer)) return "Ayer";
  const texto = fecha.toLocaleDateString("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function PanelActividad({
  proyectoId,
  turnoDestacado,
  onLimpiarDestacado,
  puedeEditar = false,
  usuarioId,
  usuarioNombre,
}: PanelActividadProps) {
  const [actorTipo, setActorTipo] = useState<ActorTipo>("");
  const [tipo, setTipo] = useState<string>("");
  const [entidadInput, setEntidadInput] = useState("");
  const [entidad, setEntidad] = useState("");
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [confirmandoReversion, setConfirmandoReversion] = useState(false);

  // La búsqueda se aplica cuando la persona deja de escribir, sin botón extra.
  useEffect(() => {
    const temporizador = setTimeout(() => setEntidad(entidadInput.trim()), 350);
    return () => clearTimeout(temporizador);
  }, [entidadInput]);

  const { eventos, cargando, cargandoMas, error, hayMas, cargar, cargarMas } = useActividad({
    proyectoId,
    abierto: true,
    filtros: {
      actorTipo: actorTipo || undefined,
      tipo: tipo || undefined,
      entidad: entidad || undefined,
    },
  });

  const reversion = useReversion({
    proyectoId,
    puedeEditar,
    usuarioId,
    usuarioNombre,
    onAplicada: () => void cargar(),
  });

  const filas = agruparEventos(eventos);
  const elegibilidad = formatearElegibilidadReversion(reversion.turno, puedeEditar);
  const cambiosDelTurno = elegibilidad.cambios;
  const filtrosActivos = [actorTipo, tipo, entidad].filter(Boolean).length;

  const limpiarFiltros = () => {
    setActorTipo("");
    setTipo("");
    setEntidadInput("");
    setEntidad("");
  };

  const aprobarReversion = async () => {
    setConfirmandoReversion(false);
    await reversion.deshacer();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-outline-variant/60 px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={entidadInput}
            onChange={(evento) => setEntidadInput(evento.target.value)}
            placeholder="Buscar por clase o entidad…"
            aria-label="Buscar actividad por entidad"
            className="w-full rounded-md border border-outline/60 bg-surface-container-low py-1.5 pl-7 pr-7 font-body-md text-[12px] text-on-surface placeholder:text-on-surface-variant outline-none focus:border-primary"
          />
          {entidadInput && (
            <button
              type="button"
              onClick={() => {
                setEntidadInput("");
                setEntidad("");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-on-surface-variant hover:bg-surface-variant"
              title="Limpiar búsqueda"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setMostrarFiltros((valor) => !valor)}
            className="flex items-center gap-1.5 rounded-md px-1 py-0.5 font-code-sm text-[10px] text-on-surface-variant transition-colors hover:text-on-surface"
            aria-expanded={mostrarFiltros}
          >
            <SlidersHorizontal className="h-3 w-3" />
            Filtros
            {filtrosActivos > 0 && (
              <span className="rounded-full bg-primary px-1.5 font-badge-label text-[8px] font-bold text-on-primary">
                {filtrosActivos}
              </span>
            )}
            <ChevronDown
              className={`h-3 w-3 transition-transform ${mostrarFiltros ? "rotate-180" : ""}`}
            />
          </button>
          {filtrosActivos > 0 && (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="font-code-sm text-[10px] text-primary hover:underline"
            >
              Limpiar
            </button>
          )}
        </div>

        {mostrarFiltros && (
          <div className="mt-1.5 space-y-1.5 rounded-md bg-surface-container-low p-1.5">
            <div className="flex flex-wrap gap-1">
              {ACTORES.map((actor) => {
                const activo = actorTipo === actor.valor;
                return (
                  <button
                    key={actor.valor || "todos"}
                    type="button"
                    onClick={() => setActorTipo(actor.valor)}
                    className={`rounded-full border px-2 py-0.5 font-code-sm text-[10px] transition-colors ${
                      activo
                        ? "border-primary bg-primary text-on-primary"
                        : "border-outline-variant/60 text-on-surface-variant hover:border-primary/50 hover:text-on-surface"
                    }`}
                  >
                    {actor.etiqueta}
                  </button>
                );
              })}
            </div>
            <select
              value={tipo}
              onChange={(evento) => setTipo(evento.target.value)}
              aria-label="Filtrar por tipo de acción"
              className="w-full rounded border border-outline/60 bg-surface-container-low px-2 py-1.5 font-code-sm text-[10px] text-on-surface outline-none focus:border-primary"
            >
              {TIPOS.map((opcion) => (
                <option key={opcion.valor || "todas"} value={opcion.valor}>
                  {opcion.etiqueta}
                </option>
              ))}
            </select>
          </div>
        )}

        {turnoDestacado && (
          <button
            type="button"
            onClick={onLimpiarDestacado}
            className="mt-2 font-code-sm text-[10px] text-primary hover:underline"
          >
            Quitar resaltado
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-2.5">
        {puedeEditar &&
          (reversion.cargando || reversion.turno?.turnoId || reversion.error || reversion.aviso) && (
            <div className="rounded-md bg-surface-container-low px-2.5 py-2">
              {reversion.cargando && (
                <p className="flex items-center gap-2 font-code-sm text-[10px] text-on-surface-variant">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Revisando el último turno de la IA…
                </p>
              )}

              {!reversion.cargando && elegibilidad.mostrarBoton && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-body-md text-[12px] text-on-surface">
                      <Undo2 className="h-3.5 w-3.5 text-primary" />
                      Último turno de la IA
                    </span>
                    {!confirmandoReversion && (
                      <button
                        type="button"
                        onClick={() => setConfirmandoReversion(true)}
                        disabled={reversion.aplicando}
                        className="rounded border border-outline/60 px-1.5 py-0.5 font-badge-label text-[8px] uppercase tracking-wider text-on-surface transition-colors hover:bg-surface disabled:opacity-50"
                      >
                        Deshacer
                      </button>
                    )}
                  </div>

                  {confirmandoReversion && (
                    <div className="mt-2 space-y-2">
                      <p className="font-code-sm text-[10px] text-on-surface-variant">
                        Se aplicarán {cambiosDelTurno} cambio(s) inversos y quedarán registrados a
                        tu nombre.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void aprobarReversion()}
                          disabled={reversion.aplicando}
                          className="rounded bg-primary px-1.5 py-0.5 font-badge-label text-[8px] uppercase tracking-wider text-on-primary hover:bg-primary/90 disabled:opacity-50"
                        >
                          {reversion.aplicando ? "Aplicando…" : "Confirmar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmandoReversion(false)}
                          disabled={reversion.aplicando}
                          className="rounded border border-outline/60 px-1.5 py-0.5 font-badge-label text-[8px] uppercase tracking-wider text-on-surface-variant hover:bg-surface disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {!reversion.cargando && elegibilidad.motivo && (
                <p className="flex items-start gap-1.5 font-code-sm text-[10px] text-on-surface-variant">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-lock" />
                  No se puede deshacer: {elegibilidad.motivo}
                </p>
              )}

              {reversion.aviso && (
                <p className="mt-1 font-code-sm text-[10px] text-green-700" role="status">
                  {reversion.aviso}
                </p>
              )}
              {reversion.error && (
                <p className="mt-1 flex items-start gap-1.5 font-code-sm text-[10px] text-error">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {reversion.error}
                </p>
              )}
            </div>
          )}

        {cargando && eventos.length === 0 && (
          <div className="space-y-2" aria-label="Cargando actividad">
            {[0, 1, 2].map((indice) => (
              <div key={indice} className="flex gap-2.5">
                <span className="mt-1 h-5 w-5 shrink-0 animate-pulse rounded-full bg-surface-container-high" />
                <span className="flex-1 space-y-1.5 rounded-md bg-surface-container-low px-2.5 py-2">
                  <span className="block h-3 w-3/4 animate-pulse rounded bg-surface-container-high" />
                  <span className="block h-2.5 w-1/3 animate-pulse rounded bg-surface-container-high" />
                </span>
              </div>
            ))}
          </div>
        )}

        {!cargando && eventos.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <History className="h-7 w-7 text-outline" />
            <p className="font-body-md text-[12px] font-medium text-on-surface">
              Todavía no hay actividad
            </p>
            <p className="max-w-[220px] font-code-sm text-[10px] text-on-surface-variant">
              Los cambios que hagas en el diagrama aparecerán aquí.
            </p>
          </div>
        )}

        {error && (
          <p className="flex items-start gap-1.5 font-code-sm text-[10px] text-error">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}

        {filas.map((fila, indice) => {
          const fecha = fechaDeFila(fila);
          const anterior = indice > 0 ? fechaDeFila(filas[indice - 1]) : "";
          const mostrarDia = !anterior || claveDia(fecha) !== claveDia(anterior);

          return (
            <Fragment key={fila.tipo === "grupo" ? `grupo-${fila.turnoId}` : fila.evento._id}>
              {mostrarDia && (
                <p className="pt-1 font-badge-label text-[8px] font-bold uppercase tracking-wider text-on-surface-variant">
                  {etiquetaDia(fecha)}
                </p>
              )}
              {fila.tipo === "grupo" ? (
                <FilaGrupo
                  eventos={fila.eventos}
                  destacado={fila.turnoId === turnoDestacado}
                  usuarioId={usuarioId}
                />
              ) : (
                <FilaEvento
                  evento={fila.evento}
                  destacado={Boolean(turnoDestacado && fila.evento.turnoId === turnoDestacado)}
                  usuarioId={usuarioId}
                />
              )}
            </Fragment>
          );
        })}

        {hayMas && (
          <button
            type="button"
            onClick={() => void cargarMas()}
            disabled={cargandoMas}
            className="self-center rounded border border-outline-variant/60 px-2 py-0.5 font-code-sm text-[10px] text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:opacity-50"
          >
            {cargandoMas ? "Cargando…" : "Cargar más"}
          </button>
        )}
      </div>
    </div>
  );
}
