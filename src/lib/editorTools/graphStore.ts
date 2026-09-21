import * as go from "gojs";

let current: go.Diagram | null = null;

export function registerDiagram(d: go.Diagram): void {
  current = d;
}

export function unregisterDiagram(): void {
  current = null;
}

export function getDiagram(): go.Diagram | null {
  return current;
}