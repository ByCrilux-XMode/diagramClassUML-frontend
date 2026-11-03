"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listarEventos } from "@/lib/actividad/api";
import type { EventoApi } from "@/lib/actividad/api";

export interface FiltrosActividadHook {
  actorTipo?: "humano" | "ia" | "sistema";
  tipo?: string;
  entidad?: string;
}

export interface UseActividadArgs {
  proyectoId: string | null;
  abierto: boolean;
  filtros?: FiltrosActividadHook;
}

const LIMITE = 50;

/** Evento que `useColaboracion` emite después de encolar un cambio propio. */
export const EVENTO_ACTIVIDAD_PROPIA = "actividad:evento-propio";

export function useActividad({ proyectoId, abierto, filtros }: UseActividadArgs) {
  const [eventos, setEventos] = useState<EventoApi[]>([]);
  const [cargando, setCargando] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const siguienteRef = useRef<string | null>(null);
  const filtrosRef = useRef(filtros);

  useEffect(() => {
    filtrosRef.current = filtros;
  }, [filtros]);

  useEffect(() => {
    siguienteRef.current = siguiente;
  }, [siguiente]);

  const cargar = useCallback(async () => {
    if (!proyectoId) return;
    setCargando(true);
    setError(null);
    try {
      const pagina = await listarEventos(proyectoId, {
        limite: LIMITE,
        ...filtrosRef.current,
      });
      setEventos(pagina.datos);
      setSiguiente(pagina.siguiente);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la actividad.");
    } finally {
      setCargando(false);
    }
    // Las dependencias reales son el proyecto y los filtros; el objeto se lee
    // por referencia para no recargar en cada render.
  }, [proyectoId, filtros?.actorTipo, filtros?.tipo, filtros?.entidad]);

  useEffect(() => {
    if (!abierto) return;
    // La carga inicial arranca en un microtask: `cargar` fija estado de carga y
    // hacerlo en el cuerpo del efecto provoca renders en cascada.
    const microtarea = queueMicrotask(() => void cargar());
    return () => {
      void microtarea;
    };
  }, [abierto, cargar]);

  // Sin polling: al recuperar el foco y después de un evento propio.
  useEffect(() => {
    if (!abierto) return;
    const alEnfocar = () => void cargar();
    const alVolver = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void cargar();
    };
    window.addEventListener("focus", alEnfocar);
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener(EVENTO_ACTIVIDAD_PROPIA, alEnfocar);
    return () => {
      window.removeEventListener("focus", alEnfocar);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener(EVENTO_ACTIVIDAD_PROPIA, alEnfocar);
    };
  }, [abierto, cargar]);

  const cargarMas = useCallback(async () => {
    const cursor = siguienteRef.current;
    if (!proyectoId || !cursor || cargandoMas) return;
    setCargandoMas(true);
    try {
      const pagina = await listarEventos(proyectoId, {
        cursor,
        limite: LIMITE,
        ...filtrosRef.current,
      });
      setEventos((previos) => [...previos, ...pagina.datos]);
      setSiguiente(pagina.siguiente);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudo cargar más actividad.");
    } finally {
      setCargandoMas(false);
    }
  }, [proyectoId, cargandoMas]);

  return {
    eventos,
    cargando,
    cargandoMas,
    error,
    hayMas: Boolean(siguiente),
    cargar,
    cargarMas,
  };
}
