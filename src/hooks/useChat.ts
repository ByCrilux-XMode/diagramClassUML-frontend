"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_URL } from "@/lib/api";
import { nuevaClave } from "@/lib/chat/clave";
import { listarMensajes, obtenerSala, enviarMensaje } from "@/lib/chat/api";
import type { MensajeChat } from "@/lib/chat/api";

export interface UsuarioChat {
  usuarioId: number | null;
  nombre: string;
}

export interface UseChatArgs {
  proyectoId: string | null;
  usuario?: UsuarioChat;
  puedeEditar: boolean;
  /** Se invoca después de persistir un mensaje que menciona a la IA. */
  onMencionIA?: (mensaje: MensajeChat) => void | Promise<void>;
}

const LIMITE_PAGINA = 50;

function ordenar(mensajes: MensajeChat[]): MensajeChat[] {
  return [...mensajes].sort((a, b) => {
    const fechaA = new Date(a.creadoEn).getTime();
    const fechaB = new Date(b.creadoEn).getTime();
    if (fechaA !== fechaB) return fechaA - fechaB;
    return a._id < b._id ? -1 : a._id > b._id ? 1 : 0;
  });
}

/** Fusiona por `_id`: el mismo mensaje puede llegar por POST, SSE y relectura. */
function fusionar(previos: MensajeChat[], entrantes: MensajeChat[], quitar?: string): MensajeChat[] {
  const mapa = new Map(previos.map((mensaje) => [mensaje._id, mensaje]));
  for (const mensaje of entrantes) mapa.set(mensaje._id, mensaje);
  if (quitar) mapa.delete(quitar);
  return ordenar([...mapa.values()]);
}

export function useChat({ proyectoId, usuario, puedeEditar, onMencionIA }: UseChatArgs) {
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [cargando, setCargando] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siguiente, setSiguiente] = useState<string | null>(null);
  const siguienteRef = useRef<string | null>(null);
  const usuarioRef = useRef(usuario);
  const mencionRef = useRef(onMencionIA);
  const proyectoRef = useRef(proyectoId);

  useEffect(() => {
    usuarioRef.current = usuario;
    mencionRef.current = onMencionIA;
    proyectoRef.current = proyectoId;
  });

  useEffect(() => {
    siguienteRef.current = siguiente;
  }, [siguiente]);

  const cargar = useCallback(async (proyecto: string) => {
    setCargando(true);
    setError(null);
    try {
      await obtenerSala(proyecto);
      const pagina = await listarMensajes(proyecto, { limite: LIMITE_PAGINA });
      setMensajes((previos) => fusionar(previos, pagina.datos));
      setSiguiente(pagina.siguiente);
    } catch (err: unknown) {
      const mensaje = err instanceof Error ? err.message : "No se pudo cargar el chat.";
      setError(mensaje);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    // El reinicio y la carga inicial se difieren a un microtask: fijar estado
    // sincrónicamente en el cuerpo del efecto encadena renders.
    const microtarea = queueMicrotask(() => {
      setMensajes([]);
      setSiguiente(null);
      if (proyectoId) void cargar(proyectoId);
    });
    return () => {
      void microtarea;
    };
  }, [proyectoId, cargar]);

  // Reconexión por relectura, no por replay: EventSource avisa que reconectó,
  // no qué se perdió. La fusión por `_id` evita duplicados.
  useEffect(() => {
    if (!proyectoId || typeof window === "undefined") return;
    const url = `${BASE_URL.replace(/\/$/, "")}/proyectos/${proyectoId}/chat/stream`;
    const fuente = new EventSource(url, { withCredentials: true });

    fuente.onmessage = (evento) => {
      try {
        const data = JSON.parse(evento.data) as { tipo?: string; mensaje?: MensajeChat };
        if (data.tipo === "mensaje.creado" && data.mensaje) {
          setMensajes((previos) => fusionar(previos, [data.mensaje as MensajeChat]));
        }
      } catch {
        // Un evento malformado no debe romper el stream.
      }
    };

    fuente.onopen = () => {
      const proyecto = proyectoRef.current;
      if (proyecto) void cargar(proyecto);
    };

    fuente.onerror = () => {
      // El navegador reintenta solo. La relectura del `onopen` cubre el hueco.
    };

    return () => fuente.close();
  }, [proyectoId, cargar]);

  const enviar = useCallback(async (texto: string) => {
    const proyecto = proyectoRef.current;
    if (!proyecto) return;
    const contenido = texto.trim();
    if (!contenido) return;

    const clave = nuevaClave();
    const autor = usuarioRef.current;
    const optimista: MensajeChat = {
      _id: `temp-${clave}`,
      salaId: "",
      proyectoId: Number(proyecto),
      tipo: "texto",
      autorTipo: "humano",
      autorUsuarioId: autor?.usuarioId ?? null,
      autorNombre: autor?.nombre ?? "Usuario",
      modelo: null,
      contenido,
      suceso: null,
      turnoId: null,
      solicitadoPor: null,
      creadoEn: new Date().toISOString(),
    };

    setEnviando(true);
    setError(null);
    setMensajes((previos) => fusionar(previos, [optimista]));

    try {
      const resultado = await enviarMensaje(proyecto, {
        contenido,
        claveIdempotencia: clave,
      });
      setMensajes((previos) => fusionar(previos, [resultado.mensaje], optimista._id));
      setEnviando(false);
      if (resultado.mensaje.autorTipo === "humano") {
        await mencionRef.current?.(resultado.mensaje);
      }
    } catch (err: unknown) {
      setMensajes((previos) => previos.filter((mensaje) => mensaje._id !== optimista._id));
      setError(err instanceof Error ? err.message : "No se pudo enviar el mensaje.");
      setEnviando(false);
    }
  }, []);

  const cargarMas = useCallback(async () => {
    const proyecto = proyectoRef.current;
    const cursor = siguienteRef.current;
    if (!proyecto || !cursor || cargandoMas) return;
    setCargandoMas(true);
    try {
      const pagina = await listarMensajes(proyecto, { cursor, limite: LIMITE_PAGINA });
      setMensajes((previos) => fusionar(previos, pagina.datos));
      setSiguiente(pagina.siguiente);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar más mensajes.");
    } finally {
      setCargandoMas(false);
    }
  }, [cargandoMas]);

  const recargar = useCallback(async () => {
    const proyecto = proyectoRef.current;
    if (proyecto) await cargar(proyecto);
  }, [cargar]);

  return {
    mensajes,
    cargando,
    cargandoMas,
    enviando,
    error,
    hayMas: Boolean(siguiente),
    enviar,
    cargarMas,
    recargar,
    puedeEditar,
  };
}
