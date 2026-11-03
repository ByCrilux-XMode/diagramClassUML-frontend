"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_URL } from "@/lib/api";
import { listarPropuestas } from "@/lib/propuestas/api";
import { aplicarEventoPropuesta } from "@/lib/propuestas/eventos";
import type { TurnoPendiente } from "@/lib/propuestas/tipos";

const LIMITE_TURNOS = 100;

/**
 * Lista de turnos pendientes del grupo. La fuente es el servidor, no el store
 * local: cualquier EDITOR ve y resuelve lo que propuso otro. Los eventos llegan
 * por el mismo stream SSE del chat (D31).
 */
export function usePropuestas(proyectoId: string | null) {
  const [turnos, setTurnos] = useState<TurnoPendiente[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const proyectoRef = useRef(proyectoId);
  const cargandoRef = useRef(false);

  useEffect(() => {
    proyectoRef.current = proyectoId;
  }, [proyectoId]);

  const cargar = useCallback(async () => {
    const proyecto = proyectoRef.current;
    if (!proyecto) {
      setTurnos([]);
      return;
    }
    if (cargandoRef.current) return;
    cargandoRef.current = true;
    setCargando(true);
    try {
      const datos = await listarPropuestas(proyecto, { limite: LIMITE_TURNOS });
      setTurnos(datos);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las propuestas.");
    } finally {
      cargandoRef.current = false;
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    setTurnos([]);
    setError(null);
    if (proyectoId) void cargar();
  }, [proyectoId, cargar]);

  useEffect(() => {
    if (!proyectoId || typeof window === "undefined") return;

    const url = `${BASE_URL.replace(/\/$/, "")}/proyectos/${proyectoId}/chat/stream`;
    const fuente = new EventSource(url, { withCredentials: true });

    fuente.onmessage = (evento) => {
      try {
        const data = JSON.parse(evento.data) as unknown;
        setTurnos((previos) => aplicarEventoPropuesta(previos, data));
      } catch {
        // Un evento malformado no rompe el stream ni la lista.
      }
    };
    fuente.onopen = () => {
      // Relectura al reconectar: EventSource avisa que reconectó, no qué se perdió.
      void cargar();
    };
    fuente.onerror = () => {
      // El navegador reintenta solo; la relectura del onopen cubre el hueco.
    };

    const alRecuperarFoco = () => {
      if (document.visibilityState === "visible") void cargar();
    };
    window.addEventListener("focus", alRecuperarFoco);
    document.addEventListener("visibilitychange", alRecuperarFoco);

    return () => {
      fuente.close();
      window.removeEventListener("focus", alRecuperarFoco);
      document.removeEventListener("visibilitychange", alRecuperarFoco);
    };
  }, [proyectoId, cargar]);

  return { turnos, cargando, error, cargar, setTurnos };
}
