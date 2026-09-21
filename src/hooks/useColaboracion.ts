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
  reAplicarTemplates?: () => void;
  onEstado?: (estado: EstadoColaboracion) => void;
}

export function useColaboracion({
  proyectoId,
  obtenerDiagrama,
  esquemaInicial,
  readOnly,
  nombreUsuario,
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
  const reAplicarTemplatesRef = useRef(reAplicarTemplates);
  const onEstadoRef = useRef(onEstado);

  useEffect(() => {
    obtenerDiagramaRef.current = obtenerDiagrama;
    esquemaInicialRef.current = esquemaInicial;
    readOnlyRef.current = readOnly;
    nombreUsuarioRef.current = nombreUsuario;
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