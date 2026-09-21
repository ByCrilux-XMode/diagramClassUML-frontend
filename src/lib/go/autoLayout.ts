"use client";

import * as go from "gojs";

export function applyGridLayout(diagram: go.Diagram | null): void {
  if (!diagram) return;
  // No forzar si hay 0-1 nodos
  const model = diagram.model as go.GraphLinksModel;
  if (model.nodeDataArray.length <= 1) return;
  try {
    diagram.startTransaction("autoLayout");
    const layout = new go.GridLayout();
    layout.wrappingColumn = 3;
    layout.spacing = new go.Size(40, 40);
    layout.alignment = go.GridAlignment.Position;
    // GridLayout respeta loc si ya existe; queremos re-posicionar todo
    // así que limpiamos el flag de isOngoing si existe
    const prevLayout = diagram.layout;
    diagram.layout = layout;
    diagram.layoutDiagram(true);
    diagram.layout = prevLayout;
    diagram.commitTransaction("autoLayout");
  } catch {
    try {
      if (diagram.undoManager?.currentTransaction) diagram.rollbackTransaction();
    } catch {
      // ignora
    }
  }
}
