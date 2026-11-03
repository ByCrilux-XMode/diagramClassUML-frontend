"use client";
//COLABOIRACION CONTROLLER
import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type * as go from "gojs";
import {
  aplicarEsquema,
  CLAVE_ESQUEMA,
  esquemaVacio,
  extraerEsquema,
} from "@/lib/go/colaboracion";
import {
  crearSocketColaboracion,
  WS_COLABORACION_BASE,
} from "@/lib/go/colaboracionSocket";
import { BASE_URL } from "@/lib/api";
import { ClienteActividad } from "@/lib/actividad/cliente";
import type { EventoActividad } from "@/lib/actividad/cliente";
import {
  capturarEventoReversion,
  configurarEnvioReversion,
} from "@/lib/actividad/reversion";
import { diffEstados } from "@/lib/actividad/diff";
import { leerEstadoSemantico } from "@/lib/actividad/estado";
import type { EstadoSemantico } from "@/lib/actividad/estado";
import { origenActual } from "@/lib/actividad/origen";
import { construirResumen } from "@/lib/actividad/resumen";
import { crearSesion } from "@/lib/actividad/sesion";

export type ConexionColaboracion = "conectando" | "conectado" | "desconectado";

// En hooks/useColaboracion.ts
export interface DragNodeInfo {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface RemoteUser {
  clientId: number;
  nombre: string;
  color: string;
  cursor?: { x: number; y: number };
  draggingNodes?: Map<string | number, DragNodeInfo>; // <-- Usar interfaz con width y height
  tempLink?: { from: { x: number; y: number }; to: { x: number; y: number } };
}

export interface EstadoColaboracion {
  conexion: ConexionColaboracion;
  synced: boolean;
  usuarios: number;
  remoteUsers: RemoteUser[];
  /** Se rellena si el servidor rechaza la actividad por permisos. */
  errorActividad?: string;
}

const COLORS = [
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80',
  '#34d399', '#2dd4bf', '#38bdf8', '#60a5fa', '#818cf8',
  '#a78bfa', '#c084fc', '#e879f9', '#f472b6', '#fb7185'
];

const ORIGEN_LOCAL = "local";
const DEBOUNCE_ESCRITURA_MS = 120;
const DEBOUNCE_AUTOSAVE_SERVIDOR_MS = 1000;
const UMBRAL_PERSISTENCIA_SERVIDOR_MS =
  DEBOUNCE_ESCRITURA_MS + DEBOUNCE_AUTOSAVE_SERVIDOR_MS + 300;

export interface UseColaboracionArgs {
  proyectoId: string | null;
  obtenerDiagrama: () => go.Diagram | null;
  esquemaInicial: Record<string, unknown> | null;
  readOnly: boolean;
  nombreUsuario?: string;
  usuarioId?: number;
  reAplicarTemplates?: () => void;
  onEstado?: (estado: EstadoColaboracion) => void;
}

export function useColaboracion({
  proyectoId,
  obtenerDiagrama,
  esquemaInicial,
  readOnly,
  nombreUsuario,
  usuarioId,
  reAplicarTemplates,
  onEstado,
}: UseColaboracionArgs) {
  const [estado, setEstado] = useState<EstadoColaboracion>({
    conexion: proyectoId ? "conectando" : "desconectado",
    synced: false,
    usuarios: 1,
    remoteUsers: [],
  });

  const [colorLocal] = useState(() => COLORS[Math.floor(Math.random() * COLORS.length)]);
  const actualizarCursorRef = useRef<(x: number, y: number) => void>(() => {});
  const actualizarDraggingRef = useRef<(nodes: Map<string | number, { x: number; y: number }>) => void>(() => {});
  const actualizarTempLinkRef = useRef<(link: { from: { x: number; y: number }; to: { x: number; y: number } } | null) => void>(() => {});

  const ultimoCambioEnRef = useRef(0);

  const obtenerDiagramaRef = useRef(obtenerDiagrama);
  const esquemaInicialRef = useRef(esquemaInicial);
  const readOnlyRef = useRef(readOnly);
  const nombreUsuarioRef = useRef(nombreUsuario);
  const usuarioIdRef = useRef(usuarioId);
  const reAplicarTemplatesRef = useRef(reAplicarTemplates);
  const onEstadoRef = useRef(onEstado);

  useEffect(() => {
    obtenerDiagramaRef.current = obtenerDiagrama;
    esquemaInicialRef.current = esquemaInicial;
    readOnlyRef.current = readOnly;
    nombreUsuarioRef.current = nombreUsuario;
    usuarioIdRef.current = usuarioId;
    reAplicarTemplatesRef.current = reAplicarTemplates;
    onEstadoRef.current = onEstado;
  });

  useEffect(() => {
    if (!proyectoId) return;

    const doc = new Y.Doc();
    const mapa = doc.getMap<unknown>(CLAVE_ESQUEMA); //esquema

    let aplicandoRemoto = false;
    let escriturasHabilitadas = false;
    let temporizadorEscritura: ReturnType<typeof setTimeout> | null = null;
    let reintentoModelo: ReturnType<typeof setTimeout> | null = null;
    let destrozado = false;
    let modeloEscuchado: go.Diagram | null = null;

    const estadoActual: EstadoColaboracion = {
      conexion: "conectando",
      synced: false,
      usuarios: 1,
      remoteUsers: [],
    };
    const publicarEstado = (parcial: Partial<EstadoColaboracion>) => {
      Object.assign(estadoActual, parcial);
      setEstado({ ...estadoActual });
      onEstadoRef.current?.({ ...estadoActual });
    };

    // --- Bitácora de actividad (fase 02) ---
    const sesion = crearSesion();
    const clienteActividad = new ClienteActividad({
      proyectoId,
      baseUrl: BASE_URL,
      alPerderPermiso: (mensaje) => publicarEstado({ errorActividad: mensaje }),
    });
    // La reversión retiene sus eventos hasta que el lote termina; aquí se
    // envían (éxito) o se degradan a turno humano normal (fallo a mitad).
    configurarEnvioReversion(async (eventos) => {
      for (const evento of eventos) clienteActividad.encolar(evento);
      await clienteActividad.vaciar(false);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("actividad:evento-propio"));
      }
    });
    let baseline: EstadoSemantico | null = null;
    const debugActividad = process.env.NEXT_PUBLIC_IA_DEBUG_ACTIVIDAD === "1" || process.env.IA_DEBUG_ACTIVIDAD === "1";

    const registrarTransaccion = () => {
      if (!escriturasHabilitadas) return;
      const diagram = obtenerDiagramaRef.current();
      if (!diagram) return;

      const nuevo = leerEstadoSemantico(diagram);
      if (!baseline) {
        baseline = nuevo;
        return;
      }
      const resultado = diffEstados(baseline, nuevo);
      baseline = nuevo;
      if (!resultado.tipo || resultado.cambios.length === 0) return;

      const origen = origenActual();
      const actorHumano = {
        usuarioId: usuarioIdRef.current ?? null,
        nombre: nombreUsuarioRef.current || "Usuario",
      };
      const ocurridoEn = new Date().toISOString();

      const evento: EventoActividad = origen
        ? {
            sesionId: sesion.sesionId,
            secuencia: sesion.siguienteSecuencia(),
            actorTipo: "ia",
            actorUsuarioId: null,
            actorNombre: "IA",
            origen: "ia",
            tipo: resultado.tipo,
            entidades: resultado.entidades,
            cambios: resultado.cambios,
            turnoId: origen.turnoId,
            modelo: origen.modelo,
            resumen: construirResumen(resultado, {
              actorTipo: "ia",
              actorNombre: "IA",
              solicitadoPor: origen.solicitadoPor,
            }),
            solicitadoPor: origen.solicitadoPor,
            aprobadoPor:
              actorHumano.usuarioId !== null
                ? { usuarioId: actorHumano.usuarioId, nombre: actorHumano.nombre }
                : null,
            ocurridoEn,
          }
        : {
            sesionId: sesion.sesionId,
            secuencia: sesion.siguienteSecuencia(),
            actorTipo: "humano",
            actorUsuarioId: actorHumano.usuarioId,
            actorNombre: actorHumano.nombre,
            origen: "manual",
            tipo: resultado.tipo,
            entidades: resultado.entidades,
            cambios: resultado.cambios,
            turnoId: null,
            modelo: null,
            resumen: construirResumen(resultado, {
              actorTipo: "humano",
              actorNombre: actorHumano.nombre,
            }),
            ocurridoEn,
          };

      if (debugActividad) {
        console.log("[actividad] evento", evento.tipo, evento.actorNombre, evento.resumen, evento.cambios.length);
      }
      // Fase 9: durante una reversión el evento se retiene hasta saber si el
      // lote completo se aplicó. Si falla a mitad, se envía como turno normal.
      if (capturarEventoReversion(evento)) return;

      clienteActividad.encolar(evento);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("actividad:evento-propio"));
      }
    };

    const nombreTransaccion = (cambio: go.ChangedEvent): string => {
      const objeto = cambio.object as { name?: unknown } | null;
      return typeof objeto?.name === "string" ? objeto.name : "";
    };

    const aplicarRemotoALaGoJS = () => {
      const diagram = obtenerDiagramaRef.current();
      if (!diagram) return;
      const esquema = extraerEsquema(doc);
      if (!esquema) return;
      try {
        const modelo = diagram.model as go.GraphLinksModel;
        const actual = JSON.parse(modelo.toJson()) as Record<string, unknown>;
        const esIgual =
          JSON.stringify(esquema) ===
          JSON.stringify({
            class: actual["class"],
            nodeDataArray: actual["nodeDataArray"] ?? [],
            linkDataArray: actual["linkDataArray"] ?? [],
          });
        if (esIgual) return;
        aplicandoRemoto = true;
        try {
          const nodos = Array.isArray(esquema["nodeDataArray"]) ? esquema["nodeDataArray"] : [];
          const enlaces = Array.isArray(esquema["linkDataArray"]) ? esquema["linkDataArray"] : [];
          modelo.mergeNodeDataArray(nodos as go.ObjectData[]);
          modelo.mergeLinkDataArray(enlaces as go.ObjectData[]);
          reAplicarTemplatesRef.current?.();
        } finally {
          aplicandoRemoto = false;
          // Los cambios remotos no se registran, pero sí pasan a formar parte
          // del baseline: si no, el siguiente cambio local los incluiría.
          if (escriturasHabilitadas) baseline = leerEstadoSemantico(obtenerDiagramaRef.current());
        }
      } catch {
        // esquema inválido o modelo sin soporte para merge, se ignora
      }
    };

    const escribirDesdeGoJS = () => {
      if (!escriturasHabilitadas) return;
      if (readOnlyRef.current) return;
      const diagram = obtenerDiagramaRef.current();
      if (!diagram) return;
      let esquema: Record<string, unknown> | null = null;
      try {
        esquema = JSON.parse(diagram.model.toJson()) as Record<string, unknown>;
      } catch {
        return;
      }
      if (!esquema) return;
      ultimoCambioEnRef.current = Date.now();
      aplicarEsquema(doc, esquema, ORIGEN_LOCAL);
    };

    const manejarModelo = (cambio: go.ChangedEvent) => {
      if (aplicandoRemoto) return;
      if (!cambio.isTransactionFinished) return;
      if (!escriturasHabilitadas) return;
      const transaccion = nombreTransaccion(cambio);
      if (transaccion === "ghostPreview" || transaccion === "clearGhost") return;
      // `confirmGhost` sí se registra: es donde la propuesta pasa a existir.
      registrarTransaccion();
      if (temporizadorEscritura) clearTimeout(temporizadorEscritura);
      temporizadorEscritura = setTimeout(escribirDesdeGoJS, DEBOUNCE_ESCRITURA_MS);
    };

    const manejarObserveMapa = (
      cambios: Y.YEvent<Y.Map<unknown>>[],
      transaccion: Y.Transaction
    ) => {
      if (transaccion.origin === ORIGEN_LOCAL) return;
      aplicarRemotoALaGoJS();
    };

    const vincularModelo = () => {
      if (destrozado || modeloEscuchado) return;
      const diagram = obtenerDiagramaRef.current();
      if (!diagram) return;
      diagram.addModelChangedListener(manejarModelo);
      modeloEscuchado = diagram;
    };

    vincularModelo();
    if (!modeloEscuchado) {
      reintentoModelo = setTimeout(vincularModelo, 100);
    }
    mapa.observeDeep(manejarObserveMapa);

    const provider = new WebsocketProvider(
      WS_COLABORACION_BASE,
      String(proyectoId),
      doc,
      {
        WebSocketPolyfill: crearSocketColaboracion(String(proyectoId)),
        maxBackoffTime: 4000,
      }
    );

    provider.awareness.setLocalStateField("user", {
      nombre: nombreUsuarioRef.current || "Usuario",
      color: colorLocal,
    });
    
    actualizarCursorRef.current = (x: number, y: number) => {
      provider.awareness.setLocalStateField("cursor", { x, y });
    };
    
    actualizarDraggingRef.current = (nodes: Map<string | number, { x: number; y: number }>) => {
      const obj: Record<string, { x: number; y: number }> = {};
      nodes.forEach((v, k) => { obj[String(k)] = v; });
      provider.awareness.setLocalStateField("draggingNodes", obj);
    };
    
    actualizarTempLinkRef.current = (link: { from: { x: number; y: number }; to: { x: number; y: number } } | null) => {
      if (link) {
        provider.awareness.setLocalStateField("tempLink", link);
      } else {
        provider.awareness.setLocalStateField("tempLink", null);
      }
    };

    const actualizarUsuarios = () => {
      const states = Array.from(provider.awareness.getStates().entries());
      const remoteUsers: RemoteUser[] = [];
      states.forEach(([clientId, state]) => {
        if (clientId !== doc.clientID) {
          const user = state.user as { nombre?: string; color?: string } | undefined;
          const cursor = state.cursor as { x: number; y: number } | undefined;
          const draggingNodes = state.draggingNodes as Record<string, { x: number; y: number }> | undefined;
          const tempLink = state.tempLink as { from: { x: number; y: number }; to: { x: number; y: number } } | undefined;
          if (user) {
            const dragMap = new Map<string | number, { x: number; y: number }>();
            if (draggingNodes) {
              Object.entries(draggingNodes).forEach(([k, v]) => dragMap.set(k, v));
            }
            remoteUsers.push({
              clientId,
              nombre: user.nombre || "Anónimo",
              color: user.color || "#000",
              cursor,
              draggingNodes: dragMap.size > 0 ? dragMap : undefined,
              tempLink,
            });
          }
        }
      });
      publicarEstado({ usuarios: states.length, remoteUsers });
    };
    provider.awareness.on("change", actualizarUsuarios);

    provider.on("sync", (sincronizado: boolean) => {
      if (destrozado) return;
      if (!sincronizado) {
        publicarEstado({ synced: false });
        return;
      }
      escriturasHabilitadas = true;
      if (
        esquemaVacio(doc) &&
        esquemaInicialRef.current &&
        typeof esquemaInicialRef.current === "object"
      ) {
        aplicarEsquema(doc, esquemaInicialRef.current, ORIGEN_LOCAL);
      }
      aplicarRemotoALaGoJS();
      // La carga inicial no se registra: fija la línea base.
      baseline = leerEstadoSemantico(obtenerDiagramaRef.current());
      publicarEstado({ synced: true });
    });

    provider.on(
      "status",
      (evento: { status: "connected" | "disconnected" | "connecting" }) => {
        if (destrozado) return;
        if (evento.status === "connected") {
          publicarEstado({ conexion: "conectado" });
        } else if (evento.status === "connecting") {
          publicarEstado({ conexion: "conectando" });
        } else {
          publicarEstado({ conexion: "desconectado", synced: false });
        }
      }
    );

    return () => {
      destrozado = true;
      configurarEnvioReversion(null);
      clienteActividad.detener();
      if (temporizadorEscritura) clearTimeout(temporizadorEscritura);
      if (reintentoModelo) clearTimeout(reintentoModelo);
      if (modeloEscuchado) modeloEscuchado.removeModelChangedListener(manejarModelo);
      mapa.unobserveDeep(manejarObserveMapa);
      provider.awareness.off("change", actualizarUsuarios);
      provider.destroy();
      doc.destroy();
    };
  }, [proyectoId]);

  const esperarPersistenciaServidor = useCallback(async () => {
    const falta =
      UMBRAL_PERSISTENCIA_SERVIDOR_MS - (Date.now() - ultimoCambioEnRef.current);
    if (falta > 0) {
      await new Promise((resolver) => setTimeout(resolver, falta));
    }
  }, []);

  const actualizarCursor = useCallback((x: number, y: number) => {
    actualizarCursorRef.current(x, y);
  }, []);

  const actualizarDragging = useCallback((nodes: Map<string | number, { x: number; y: number }>) => {
    actualizarDraggingRef.current(nodes);
  }, []);

  const actualizarTempLink = useCallback((link: { from: { x: number; y: number }; to: { x: number; y: number } } | null) => {
    actualizarTempLinkRef.current(link);
  }, []);

  return { estado, esperarPersistenciaServidor, actualizarCursor, actualizarDragging, actualizarTempLink };
}