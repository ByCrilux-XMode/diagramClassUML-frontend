"use client";

import { forwardRef, useEffect, useImperativeHandle, useReducer, useRef, useState } from "react";
import * as React from "react";
import * as go from "gojs";
import ClassPalette from "./ClassPalette";
import LinkInspector from "./LinkInspector";
import NodeInspector from "./NodeInspector";
import RelationPicker from "./RelationPicker";
import { formatLoc } from "@/lib/go/converters";
import {
  createLinkTemplateMap,
  createNodeTemplateMap,
  createPaletteNodeTemplateMap,
} from "@/lib/go/registry";
import { useColaboracion } from "@/hooks/useColaboracion";
import type { EstadoColaboracion } from "@/hooks/useColaboracion";
import type { NodeCategory, RelationshipLinkData, UMLRelationType, UmlNodeData } from "@/types/uml";
import { registerDiagram, unregisterDiagram } from "@/lib/editorTools";

const nodeTemplateMap = createNodeTemplateMap();
const linkTemplateMap = createLinkTemplateMap();
const paletteNodeTemplateMap = createPaletteNodeTemplateMap();

export type GoJSCanvasHandle = {
  getJson: () => Record<string, unknown> | null;
  setJson: (data: Record<string, unknown> | null) => void;
  esperarPersistenciaServidor: () => Promise<void>;
};

interface GoJSCanvasProps {
  esquemaInicial?: Record<string, unknown> | null;
  proyectoId?: string;
  readOnly?: boolean;
  nombreUsuario?: string;
  onEstadoColaboracion?: (estado: EstadoColaboracion) => void;
}

const GoJSCanvas = forwardRef<GoJSCanvasHandle, GoJSCanvasProps>(function GoJSCanvas(
  { esquemaInicial, proyectoId, readOnly = false, nombreUsuario, onEstadoColaboracion },
  ref
) {
  const diagramRef = useRef<HTMLDivElement>(null);
  const diagramInstance = useRef<go.Diagram | null>(null);
  const [selected, setSelected] = useState<UmlNodeData | null>(null);
  const [selectedLink, setSelectedLink] = useState<RelationshipLinkData | null>(null);
  const [activeRelation, setActiveRelation] = useState<UMLRelationType | null>(null);
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  const [pendingPickerKey, setPendingPickerKey] = useState<string | number | null>(null);

  const activeRelationRef = useRef<UMLRelationType | null>(null);
  const pendingSetterRef = useRef<(k: string | number | null) => void>(() => {});
  const pollingRef = useRef<number>(0);
  const [inspectorHeight, setInspectorHeight] = useState(160);
  const resizingRef = useRef<{ startY: number; startH: number } | null>(null);

  const onInspectorHandleMouseDown = (e: React.MouseEvent) => {
    resizingRef.current = { startY: e.clientY, startH: inspectorHeight };
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = resizingRef.current.startY - ev.clientY;
      const next = Math.min(Math.max(resizingRef.current.startH + delta, 100), window.innerHeight * 0.45);
      setInspectorHeight(next);
    };
    const onUp = () => {
      resizingRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    activeRelationRef.current = activeRelation;
  }, [activeRelation]);
  useEffect(() => {
    pendingSetterRef.current = setPendingPickerKey;
  }, []);

  // La sesión colaborativa (Yjs) se monta cuando existe el diagrama.
  const { estado: estadoColaboracion, esperarPersistenciaServidor, actualizarCursor, actualizarDragging, actualizarTempLink } = useColaboracion({
    proyectoId: proyectoId ?? null,
    obtenerDiagrama: () => diagramInstance.current,
    esquemaInicial: esquemaInicial ?? null,
    readOnly,
    nombreUsuario,
    reAplicarTemplates: () => {
      const diagram = diagramInstance.current;
      if (!diagram) return;
      diagram.nodeTemplateMap = nodeTemplateMap;
      diagram.linkTemplateMap = linkTemplateMap;
    },
    onEstado: onEstadoColaboracion,
  });

  useImperativeHandle(
    ref,
    () => ({
      getJson: () => {
        const diagram = diagramInstance.current;
        if (!diagram) return null;
        try {
          const jsonStr = diagram.model.toJson();
          return JSON.parse(jsonStr) as Record<string, unknown>;
        } catch {
          return null;
        }
      },
      setJson: (data) => {
        const diagram = diagramInstance.current;
        if (!diagram || !data) return;
        try {
          diagram.model = go.Model.fromJson(data as never) as go.GraphLinksModel;
          // re-aplicar templates por si el fromJson los pierde
          diagram.nodeTemplateMap = nodeTemplateMap;
          diagram.linkTemplateMap = linkTemplateMap;
        } catch {
          // fallback manual
        }
      },
      esperarPersistenciaServidor,
    }),
    [esperarPersistenciaServidor]
  );

  useEffect(() => {
    if (!diagramRef.current) return;

    const diagram = new go.Diagram(diagramRef.current, {
      "undoManager.isEnabled": true,
      "resizingTool.isEnabled": true,
    });

    diagram.toolManager.draggingTool.dragsLink = true;
    diagram.toolManager.linkingTool.isUnconnectedLinkValid = true;
    diagram.toolManager.relinkingTool.isUnconnectedLinkValid = true;
    diagram.toolManager.relinkingTool.fromHandleArchetype = new go.Shape(
      "Diamond",
      {
        segmentIndex: 0,
        cursor: "pointer",
        desiredSize: new go.Size(9, 9),
        fill: "#006877",
        stroke: "#fdf9f5",
      }
    );
    diagram.toolManager.relinkingTool.toHandleArchetype = new go.Shape(
      "Diamond",
      {
        segmentIndex: -1,
        cursor: "pointer",
        desiredSize: new go.Size(9, 9),
        fill: "#006877",
        stroke: "#fdf9f5",
      }
    );

    diagram.nodeTemplateMap = nodeTemplateMap;
    diagram.linkTemplateMap = linkTemplateMap;

    // Guard: evita crash findObjectAt con NaN (GoJS internos lo llaman con puntos inválidos tras links flotantes)
    const origFindObjectAt = (diagram as unknown as { findObjectAt: (p: go.Point, ...a: unknown[]) => go.GraphObject | null }).findObjectAt.bind(diagram);
    (diagram as unknown as { findObjectAt: (p: go.Point, ...a: unknown[]) => go.GraphObject | null }).findObjectAt = (
      p: go.Point,
      navig?: unknown,
      pred?: unknown,
    ) => {
      if (!p || typeof p.x !== "number" || typeof p.y !== "number" || !isFinite(p.x) || !isFinite(p.y)) return null;
      return origFindObjectAt(p, navig as never, pred as never);
    };

    diagram.addDiagramListener("ChangedSelection", (event) => {
      const part = event.diagram.selection.first();
      if (part instanceof go.Node) {
        setSelected(part.data as UmlNodeData);
        setSelectedLink(null);
      } else if (part instanceof go.Link) {
        setSelected(null);
        setSelectedLink(part.data as RelationshipLinkData);
      } else {
        setSelected(null);
        setSelectedLink(null);
      }
      forceRender();
    });

    const clearStalePoints = (event: go.DiagramEvent) => {
      const link = event.subject as go.Link;
      if (link && link.fromNode && link.toNode && "points" in link.data) {
        diagram.model.setDataProperty(link.data, "points", null);
      }
    };

    const autoConnectFloatingLink = (link: go.Link) => {
      const data = link.data as { from?: unknown; to?: unknown } | null;
      if (!data) return;
      const hasFrom = data.from !== undefined && data.from !== null;
      const hasTo = data.to !== undefined && data.to !== null;
      const needTo = hasFrom && !hasTo;
      const needFrom = !hasFrom && hasTo;
      if (!needTo && !needFrom) return;

      const defaultPt = needTo ? link.defaultToPoint : link.defaultFromPoint;
      const hasDefaultPt =
        defaultPt && typeof defaultPt.x === "number" && !isNaN(defaultPt.x);
      let endPt: go.Point | null = hasDefaultPt ? defaultPt : null;
      if (!endPt) {
        const fallbackPt =
          link.pointsCount > 0
            ? link.getPoint(needTo ? link.pointsCount - 1 : 0)
            : null;
        if (fallbackPt && !isNaN(fallbackPt.x)) endPt = fallbackPt;
        else {
          const lastPt = diagram.lastInput.documentPoint;
          if (lastPt && !isNaN(lastPt.x)) endPt = lastPt;
        }
      }
      if (!endPt) return;

      const skipKey = needTo ? data.from : data.to;
      let bestKey: string | number | undefined;
      let bestDist = Infinity;
      diagram.nodes.each((node) => {
        const nodeKey = (node.data as { key?: unknown } | null)?.key;
        if (nodeKey === undefined || nodeKey === null || nodeKey === skipKey) return;
        const dx = endPt.x - node.location.x;
        const dy = endPt.y - node.location.y;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          bestKey = nodeKey as string | number;
        }
      });
      if (bestKey === undefined) return;

      const model = diagram.model as go.GraphLinksModel;
      model.setDataProperty(data, needTo ? "to" : "from", bestKey);
      if ("points" in data) model.setDataProperty(data, "points", null);
      if (needTo) link.defaultToPoint = new go.Point(NaN, NaN);
      else link.defaultFromPoint = new go.Point(NaN, NaN);
      link.invalidateRoute();
    };

    const handleLinkCreated = (event: go.DiagramEvent) => {
      const link = event.subject as go.Link;
      if (!link) return;
      clearStalePoints(event);
      autoConnectFloatingLink(link);
      const data = link.data as { key?: unknown; from?: unknown; to?: unknown } | null;
      const hasFrom = data?.from !== undefined && data?.from !== null;
      const hasTo = data?.to !== undefined && data?.to !== null;
      // si venía con chip pre-seleccionado, no preguntar; si no, abrir picker para elegir tipo
      if (hasFrom && hasTo && activeRelationRef.current === null) {
        let key = (data as { key?: string | number })?.key;
        if (!key) {
           key = `${String(data.from)}-${String(data.to)}-${Date.now()}`;
           diagram.model.setDataProperty(data, "key", key);
        }
        setTimeout(() => pendingSetterRef.current(key as string | number), 0);
      } else {
        setTimeout(() => diagram.clearSelection(), 0);
      }
    };
    diagram.addDiagramListener("LinkDrawn", handleLinkCreated);
    diagram.addDiagramListener("LinkRelinked", (e) => {
      clearStalePoints(e);
      const link = e.subject as go.Link;
      if (link && link.fromNode && link.toNode) {
        link.defaultFromPoint = new go.Point(NaN, NaN);
        link.defaultToPoint = new go.Point(NaN, NaN);
        link.invalidateRoute();
      }
    });

    // polling en tiempo real
    const startPolling = () => {
      if (pollingRef.current) return;
      const poll = () => {
        const d = diagramInstance.current;
        if (!d) return;
        const dt = d.toolManager.draggingTool;
        const lt = d.toolManager.linkingTool;
        
        // Broadcast dragging nodes
        if (dt.isActive && !readOnly && dt.draggedParts) {
          const nodes = new Map<string | number, { x: number; y: number; width: number; height: number }>();
          dt.draggedParts.each((kvp: go.IKeyValuePair<go.Part, go.DraggingInfo>) => {
            const part = kvp.key;
            if (part instanceof go.Node) {
              const key = (part.data as { key?: string | number }).key ?? part.key;
              if (key !== undefined) {
                nodes.set(key, {
                  x: part.actualBounds.x,
                  y: part.actualBounds.y,
                  width: part.actualBounds.width,
                  height: part.actualBounds.height,
                });
              }
            }
          });
          if (nodes.size > 0) actualizarDragging(nodes);
        } else if (!dt.isActive) {
          // Clear dragging when tool becomes inactive
          actualizarDragging(new Map());
        }
        
        // Broadcast temporary link during linking
        if (lt.isActive && !readOnly) {
          const baseTool = lt as go.LinkingBaseTool;
          const tempLink = baseTool.temporaryLink;
          const tempFromPort = baseTool.temporaryFromPort;
          const tempToPort = baseTool.temporaryToPort;
          if (tempLink && tempFromPort && tempToPort) {
            const fromPt = tempFromPort.getDocumentPoint(go.Spot.Center);
            const toPt = tempToPort.getDocumentPoint(go.Spot.Center);
            actualizarTempLink({ from: { x: fromPt.x, y: fromPt.y }, to: { x: toPt.x, y: toPt.y } });
          }
        } else if (!lt.isActive) {
          actualizarTempLink(null);
        }
        
        pollingRef.current = requestAnimationFrame(poll);
      };
      pollingRef.current = requestAnimationFrame(poll);
    };
    const stopPolling = () => {
      if (pollingRef.current) {
        cancelAnimationFrame(pollingRef.current);
        pollingRef.current = 0;
      }
    };
    
    // Start polling when diagram is ready
    startPolling();

    diagram.addDiagramListener("ViewportBoundsChanged", () => {
      forceRender();
    });

    diagram.model = new go.GraphLinksModel({
      nodeKeyProperty: "key",
      linkKeyProperty: "key",
      linkCategoryProperty: "category",
      nodeDataArray: [],
      linkDataArray: [],
    });

    diagramInstance.current = diagram;
    registerDiagram(diagram);

    return () => {
      stopPolling();
      unregisterDiagram();
      diagram.div = null;
      diagramInstance.current = null;
    };
  }, []);

  useEffect(() => {
    const diagram = diagramInstance.current;
    if (!diagram || !esquemaInicial || typeof esquemaInicial !== "object") return;
    // Con colaboración activa, la fuente del diagrama es la sesión Yjs (o su
    // fallback local si la conexión falló). Sin proyecto la carga local es directa.
    if (proyectoId && estadoColaboracion.conexion !== "desconectado") return;
    try {
      const raw = esquemaInicial as Record<string, unknown>;
      const hasNodes = Array.isArray(raw["nodeDataArray"]) || Array.isArray(raw["nodes"]);
      const hasLinks = Array.isArray(raw["linkDataArray"]) || Array.isArray(raw["links"]);
      if (!hasNodes && !hasLinks && !raw["class"]) return;
      if (raw["class"] === "GraphLinksModel") {
        diagram.model = go.Model.fromJson(raw as never) as go.GraphLinksModel;
      } else {
        const nodes = (raw["nodes"] as unknown[] | undefined) ?? (raw["nodeDataArray"] as unknown[] | undefined) ?? [];
        const links = (raw["links"] as unknown[] | undefined) ?? (raw["linkDataArray"] as unknown[] | undefined) ?? [];
        const model = new go.GraphLinksModel({
          nodeKeyProperty: "key",
          linkKeyProperty: "key",
          linkCategoryProperty: "category",
          nodeDataArray: nodes as never[],
          linkDataArray: links as never[],
        });
        diagram.model = model;
      }
      diagram.nodeTemplateMap = nodeTemplateMap;
      diagram.linkTemplateMap = linkTemplateMap;
    } catch {
      // json inválido
    }
  }, [esquemaInicial, proyectoId, estadoColaboracion.conexion]);

  useEffect(() => {
    const diagram = diagramInstance.current;
    if (!diagram) return;
    diagram.isReadOnly = readOnly;
    diagram.allowDrop = !readOnly;
    diagram.allowResize = !readOnly;
  }, [readOnly]);

  useEffect(() => {
    const diagram = diagramInstance.current;
    if (!diagram) return;
    // habilitado para CREADOR/EDITOR; LECTOR solo visualiza
    diagram.toolManager.linkingTool.isEnabled = !readOnly;
    diagram.toolManager.linkingTool.archetypeLinkData = activeRelation
      ? { category: activeRelation }
      : { category: "association" as UMLRelationType };
    diagram.toolManager.draggingTool.isEnabled = !readOnly;
    diagram.toolManager.draggingTool.dragsLink = !readOnly;
    // relinking solo cuando no estás creando (evita robar el drag)
    diagram.toolManager.relinkingTool.isEnabled = !readOnly && activeRelation === null;
  }, [activeRelation, readOnly]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (pendingPickerKey !== null) {
          // cancelar picker borra el link pendiente
          const diagram = diagramInstance.current;
          if (diagram) {
            const model = diagram.model as go.GraphLinksModel;
            const data = model.linkDataArray.find((d) => (d as { key?: unknown }).key === pendingPickerKey);
            if (data) {
              diagram.commit(() => {
                model.removeLinkData(data);
              }, "escape-cancel-link");
            }
          }
          setPendingPickerKey(null);
        }
        setActiveRelation(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingPickerKey]);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (readOnly) return;
    const diagram = diagramInstance.current;
    if (!diagram) return;
    const rect = diagramRef.current?.getBoundingClientRect();
    if (!rect) return;
    const docPt = diagram.transformViewToDoc(
      new go.Point(event.clientX - rect.left, event.clientY - rect.top)
    );

    const nodeCategory = event.dataTransfer.getData("application/x-node-category") as NodeCategory | "";
    if (nodeCategory) {
      const key = `node-${Date.now()}`;
      const loc = formatLoc(docPt);
      let nodeData: UmlNodeData;
      if (nodeCategory === "Class") {
        nodeData = { key, name: "Clase", category: "Class", isAbstract: false, attributes: [], methods: [], loc } as UmlNodeData;
      } else if (nodeCategory === "Interface") {
        nodeData = { key, name: "Interfaz", category: "Interface", methods: [], loc } as UmlNodeData;
      } else {
        nodeData = { key, name: "Enum", category: "Enum", literals: [], loc } as UmlNodeData;
      }
      diagram.model.commit((m) => {
        (m as go.GraphLinksModel).addNodeData(nodeData as unknown as object);
      });
      const added = (diagram.model as go.GraphLinksModel).nodeDataArray.find((d) => (d as { key?: unknown }).key === key);
      if (added) {
        const part = diagram.findNodeForData(added);
        if (part) diagram.select(part);
      }
      return;
    }

    const category = event.dataTransfer.getData("text/plain") as UMLRelationType | "";
    if (!category) return;

    const key = `floating-${Date.now()}`;
    diagram.model.commit((m) => {
      (m as go.GraphLinksModel).addLinkData({
        key,
        category,
        points: [
          new go.Point(docPt.x + 24, docPt.y),
          new go.Point(docPt.x + 180, docPt.y),
        ],
      });
    });

    const linkData = (diagram.model as go.GraphLinksModel).linkDataArray.find(
      (d) => d.key === key
    );
    if (linkData) {
      const link = diagram.findLinkForData(linkData);
      if (link) diagram.select(link);
    }
  };

  const handlePickerSelect = (category: UMLRelationType) => {
    const diagram = diagramInstance.current;
    if (diagram && pendingPickerKey !== null) {
      const model = diagram.model as go.GraphLinksModel;
      const data = model.linkDataArray.find((d) => (d as { key?: unknown }).key === pendingPickerKey);
      // si el key era sintético (sin key real), buscar por from/to del último link
      const target = data ?? (model.linkDataArray[model.linkDataArray.length - 1] as { from?: unknown; to?: unknown; key?: unknown } | undefined);
      if (target) {
        diagram.commit((d) => {
          model.setDataProperty(target, "category", category);
          const link = d.findLinkForData(target);
          if (link) {
          link.invalidateRoute();
          d.select(link);
          }
        }, "change-relation-category");
      }
    }
    setPendingPickerKey(null);
    setActiveRelation(null);
  };

  const handlePickerCancel = () => {
    const diagram = diagramInstance.current;
    if (diagram && pendingPickerKey !== null) {
      const model = diagram.model as go.GraphLinksModel;
      const data = model.linkDataArray.find((d) => (d as { key?: unknown }).key === pendingPickerKey);
      const target = data ?? (model.linkDataArray[model.linkDataArray.length - 1] as { key?: unknown } | undefined);
      if (target) {
        diagram.commit(()=>{
          model.removeLinkData(target as object);
        }, "cancel-link-picker");
      }  
    }
    setPendingPickerKey(null);
  };

  const commit = (updates: Record<string, unknown>) => {
    const diagram = diagramInstance.current;
    if (!diagram || !selected) return;
    diagram.startTransaction("inspect");
    for (const [prop, value] of Object.entries(updates)) {
      diagram.model.setDataProperty(selected, prop, value);
    }
    diagram.commitTransaction("inspect");
    forceRender();
  };

  const commitLink = (updates: Record<string, unknown>) => {
    const diagram = diagramInstance.current;
    if (!diagram || !selectedLink) return;
    const model = diagram.model as go.GraphLinksModel;
    // buscar el objeto real dentro del model (selectedLink puede ser copia tras re-render)
    const target =
      (model.linkDataArray.find((d) => d === selectedLink) as RelationshipLinkData | undefined) ??
      (model.linkDataArray.find(
        (d) => (d as { key?: unknown }).key === (selectedLink as { key?: unknown }).key
      ) as RelationshipLinkData | undefined) ??
      selectedLink;
    diagram.startTransaction("inspect-link");
    for (const [prop, value] of Object.entries(updates)) {
      diagram.model.setDataProperty(target, prop, value);
    }
    diagram.commitTransaction("inspect-link");
    forceRender();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        <ClassPalette
          nodeTemplateMap={paletteNodeTemplateMap}
          activeRelation={activeRelation}
          onSelectRelation={setActiveRelation}
        />

        <div
          ref={diagramRef}
          className="grid-bg relative flex-1 bg-surface-dim overflow-hidden"
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }}
          onDrop={handleDrop}
          onMouseMove={(e) => {
            const diagram = diagramInstance.current;
            if (diagram && diagramRef.current) {
              const rect = diagramRef.current.getBoundingClientRect();
              if (!isFinite(rect.width) || !isFinite(rect.height) || rect.width === 0) return;
              const viewPt = new go.Point(e.clientX - rect.left, e.clientY - rect.top);
              if (!isFinite(viewPt.x) || !isFinite(viewPt.y)) return;
              const docPt = diagram.transformViewToDoc(viewPt);
              if (!isFinite(docPt.x) || !isFinite(docPt.y)) return;
              actualizarCursor(docPt.x, docPt.y);
            }
          }}
        >
          {estadoColaboracion.remoteUsers?.map((user) => {
            const diagram = diagramInstance.current;
            if (!diagram) return null;
            const fragments: React.ReactNode[] = [];
            
            // Cursor
            if (user.cursor) {
              const pt = new go.Point(user.cursor.x, user.cursor.y);
              const viewPt = diagram.transformDocToView(pt);
              fragments.push(
                <div
                  key={`${user.clientId}-cursor`}
                  style={{
                    position: "absolute",
                    left: viewPt.x,
                    top: viewPt.y,
                    pointerEvents: "none",
                    zIndex: 50,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: "drop-shadow(1px 1px 2px rgba(0,0,0,0.4))" }}>
                    <path d="M2.32837 0.999512L15.3284 6.99951L8.82837 9.49951L6.32837 15.9995L2.32837 0.999512Z" fill={user.color} stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                  <div style={{
                    backgroundColor: user.color,
                    color: "#fff",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    whiteSpace: "nowrap",
                    marginTop: "2px",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                    transform: "translateX(8px)",
                    display: "inline-block"
                  }}>
                    {user.nombre}
                  </div>
                </div>
              );
            }
            
            // Dragging nodes - ghost preview
            if (user.draggingNodes && user.draggingNodes.size > 0) {
              user.draggingNodes.forEach((pos, key) => {
                const pt = new go.Point(pos.x, pos.y);
                const viewPt = diagram.transformDocToView(pt);

                //escalar segun pantalla
                const ancho = (pos.width ?? 120) * diagram.scale;
                const alto = (pos.height ?? 60) * diagram.scale;

                fragments.push(
                  <div
                    key={`${user.clientId}-drag-${key}`}
                    style={{
                      position: "absolute",
                      left: viewPt.x,
                      top: viewPt.y,
                      pointerEvents: "none",
                      zIndex: 40,
                      //transform: "translate(-50%, -50%)",
                    }}
                  >
                    <div style={{
                      width: `${ancho}px`,
                      height: `${alto}px`,
                      border: `2px dashed ${user.color}`,
                      borderRadius: "8px",
                      backgroundColor: `${user.color}20`,
                      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    }} />
                  </div>
                );
              });
            }
            
            // Temp link - preview during link creation
            if (user.tempLink) {
              const fromPt = new go.Point(user.tempLink.from.x, user.tempLink.from.y);
              const toPt = new go.Point(user.tempLink.to.x, user.tempLink.to.y);
              const fromView = diagram.transformDocToView(fromPt);
              const toView = diagram.transformDocToView(toPt);
              fragments.push(
                <svg
                  key={`${user.clientId}-templink`}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                    zIndex: 40,
                  }}
                >
                  <line
                    x1={fromView.x}
                    y1={fromView.y}
                    x2={toView.x}
                    y2={toView.y}
                    stroke={user.color}
                    strokeWidth={2}
                    strokeDasharray="8,4"
                    style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}
                  />
                  <polygon
                    points={`${toView.x - 8},${toView.y - 5} ${toView.x},${toView.y} ${toView.x - 8},${toView.y + 5}`}
                    fill={user.color}
                  />
                </svg>
              );
            }
            
            return <React.Fragment key={user.clientId}>{fragments}</React.Fragment>;
          })}
          {pendingPickerKey !== null && (
            <RelationPicker onSelect={handlePickerSelect} onCancel={handlePickerCancel} />
          )}
        </div>
      </div>

      {(selected || selectedLink) && (
        <div
          style={{ height: inspectorHeight }}
          className="flex max-h-[45dvh] min-h-[100px] shrink-0 flex-col border-t border-outline-variant/60 bg-surface-container-low"
        >
          <div
            onMouseDown={onInspectorHandleMouseDown}
            className="flex h-3 shrink-0 cursor-row-resize items-center justify-center border-b border-outline-variant/40 bg-surface-container-low hover:bg-primary/10"
            title="Arrastra para ajustar altura"
          >
            <div className="h-1 w-12 rounded bg-outline-variant/60" />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {selected && (
              <NodeInspector
                data={selected}
                onChange={commit}
                onClose={() => diagramInstance.current?.clearSelection()}
              />
            )}
            {selectedLink && (
              <LinkInspector
                data={selectedLink}
                onChange={commitLink}
                onClose={() => diagramInstance.current?.clearSelection()}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default GoJSCanvas;
