"use client";

import { useCallback, useEffect, useState } from "react";
import { obtenerUltimoTurnoIA } from "@/lib/actividad/api";
import type { UltimoTurnoIA } from "@/lib/actividad/api";
import {
  aplicarReversion,
  construirResumenReversion,
  construirReversion,
  finalizarCapturaReversion,
  iniciarCapturaReversion,
} from "@/lib/actividad/reversion";
import { nuevaClave } from "@/lib/chat/clave";

export interface UseReversionArgs {
  proyectoId: string | null;
  puedeEditar: boolean;
  usuarioId?: number;
  usuarioNombre?: string;
  /** Se invoca cuando la reversión se aplicó y registró correctamente. */
  onAplicada?: () => void;
}

export interface EstadoReversion {
  turno: UltimoTurnoIA | null;
  cargando: boolean;
  aplicando: boolean;
  error: string | null;
  aviso: string | null;
  puedeDeshacer: boolean;
  motivo: string | null;
  consultar: () => Promise<void>;
  deshacer: () => Promise<boolean>;
}

/**
 * Estado de la reversión del último turno de IA (fase 9, D69/D70).
 *
 * La consulta solo se hace con permiso de edición: un LECTOR recibe 403 del
 * servidor y la interfaz no debe ofrecer la acción. La aplicación reutiliza el
 * camino de escritura del HITL y no registra el evento de reversión si algún
 * paso falla.
 */
export function useReversion({
  proyectoId,
  puedeEditar,
  usuarioId,
  usuarioNombre,
  onAplicada,
}: UseReversionArgs): EstadoReversion {
  const [turno, setTurno] = useState<UltimoTurnoIA | null>(null);
  const [cargando, setCargando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const consultar = useCallback(async () => {
    if (!proyectoId || !puedeEditar) {
      setTurno(null);
      setError(null);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      setTurno(await obtenerUltimoTurnoIA(proyectoId));
    } catch (err: unknown) {
      setTurno(null);
      setError(
        err instanceof Error ? err.message : "No se pudo consultar el último turno de la IA.",
      );
    } finally {
      setCargando(false);
    }
  }, [proyectoId, puedeEditar]);

  useEffect(() => {
    void consultar();
  }, [consultar]);

  const deshacer = useCallback(async (): Promise<boolean> => {
    if (!turno || !proyectoId || !puedeEditar || aplicando) return false;

    setError(null);
    setAviso(null);

    let propuestas;
    try {
      propuestas = construirReversion(turno);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "El turno no se puede deshacer.");
      return false;
    }

    if (!turno.turnoId) {
      setError("No hay un turno de IA que deshacer.");
      return false;
    }

    setAplicando(true);
    const autor = {
      usuarioId: usuarioId ?? 0,
      nombre: usuarioNombre?.trim() || "Usuario",
    };
    const turnoId = nuevaClave();
    const resumen = construirResumenReversion(turno, autor, turno.entidades.length);
    iniciarCapturaReversion({
      turnoId,
      revierteTurnoId: turno.turnoId,
      autor,
      resumen,
    });

    let resultado;
    try {
      resultado = aplicarReversion(propuestas, { proyectoId });
    } catch (err: unknown) {
      resultado = {
        aplicadas: 0,
        errores: [err instanceof Error ? err.message : String(err)],
        traza: [],
      };
    }

    const exito = resultado.errores.length === 0 && resultado.aplicadas > 0;
    try {
      await finalizarCapturaReversion(exito);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? `Los cambios se aplicaron, pero no se pudo registrar la reversión: ${err.message}`
          : "Los cambios se aplicaron, pero no se pudo registrar la reversión.",
      );
    }

    setAplicando(false);

    if (exito) {
      setAviso("Se deshizo el último turno de la IA.");
      setTurno(null);
      onAplicada?.();
      return true;
    }

    setError(resultado.errores.join(" ") || "La reversión no se pudo aplicar.");
    // Una aplicación parcial ya no es reversible: se refresca la elegibilidad.
    void consultar();
    return false;
  }, [
    aplicando,
    consultar,
    onAplicada,
    puedeEditar,
    proyectoId,
    turno,
    usuarioId,
    usuarioNombre,
  ]);

  return {
    turno,
    cargando,
    aplicando,
    error,
    aviso,
    puedeDeshacer: Boolean(turno?.turnoId && turno.deshacible),
    motivo: turno?.motivo ?? null,
    consultar,
    deshacer,
  };
}
