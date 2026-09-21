"use client";

import * as go from "gojs";
import { getDiagram } from "@/lib/editorTools";
import type { PendingProposal } from "@/lib/ia/types";
import type { AttributeData, MethodData, Visibility } from "@/types/uml";

let ghostNodeKeys = new Set<string>();
let ghostLinkKeys = new Set<string>();

function nextGhostLoc(diagram: go.Diagram, index: number): string {
  const vb = diagram.viewportBounds;
  const hasViewport = vb && isFinite(vb.x) && isFinite(vb.y) && vb.width > 10 && vb.height > 10;
  const center = hasViewport ? vb.center : new go.Point(0, 0);
  const cx = isFinite(center.x) ? center.x : 0;
  const cy = isFinite(center.y) ? center.y : 0;
  const cols = 3;
  const gapX = 320;
  const gapY = 190;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const originX = cx - ((cols - 1) * gapX) / 2;
  const originY = cy - 80;
  const x = originX + col * gapX;
  const y = originY + row * gapY;
  return `${x} ${y}`;
}

function toAttributeData(a: { name: string; type?: string; visibility?: Visibility }): AttributeData {
  const vis = a.visibility && ["+", "-", "#", "~"].includes(a.visibility) ? a.visibility : "+";
  return { name: a.name, type: a.type ?? "", visibility: vis as Visibility };
}

function toMethodData(m: {
  name: string;
  visibility?: Visibility;
  parameters?: Array<{ name: string; type: string; direction?: string }>;
  returnType?: string;
}): MethodData {
  return {
    name: m.name,
    visibility: (m.visibility && ["+", "-", "#", "~"].includes(m.visibility) ? m.visibility : "+") as Visibility,
    parameters: (m.parameters ?? []).map((p) => ({
      direction: (p.direction as MethodData["parameters"][number]["direction"]) ?? "in",
      name: p.name,
      type: p.type,
    })),
    returnType: m.returnType,
  };
}

function normalizeKey(k: unknown): string {
  return String(k ?? "").trim().toLowerCase();
}

export function showGhostPreview(pending: PendingProposal[]): void {
  const diagram = getDiagram();
  if (!diagram) return;
  // limpiar previos por si quedó alguno
  clearGhostPreview();
  const model = diagram.model as go.GraphLinksModel;
  diagram.startTransaction("ghostPreview");
  try {
    let nodeCountBefore = model.nodeDataArray.length;
    for (const p of pending) {
      if (p.toolName === "addClass") {
        const rawKey = String((p.args as Record<string, unknown>).key ?? p.id);
        const key = normalizeKey(rawKey);
        if (model.nodeDataArray.some((n) => normalizeKey((n as { key?: unknown }).key) === key)) continue;
        const attrs = (p.args as { attributes?: Array<{ name: string; type?: string; visibility?: Visibility }> }).attributes;
        const methods = (p.args as { methods?: Array<{ name: string; visibility?: Visibility; parameters?: Array<{ name: string; type: string }>; returnType?: string }> }).methods;
        const rawLoc = (p.args as { loc?: string }).loc;
        const isValidLoc =
          typeof rawLoc === "string" &&
          rawLoc.trim().split(/\s+/).length === 2 &&
          rawLoc
            .trim()
            .split(/\s+/)
            .every((s) => isFinite(Number(s)));
        const loc = isValidLoc ? (rawLoc as string).trim() : nextGhostLoc(diagram, nodeCountBefore++);
        const cat = String((p.args as Record<string, unknown>).category ?? "Class") as "Class" | "Interface" | "Enum";
        const isAbs = Boolean((p.args as Record<string, unknown>).isAbstract);
        const lits = (p.args as Record<string, unknown>).literals as string[] | undefined;
        let node: Record<string, unknown>;
        if (cat === "Enum") {
          node = {
            key,
            name: String((p.args as Record<string, unknown>).name ?? key),
            category: "Enum",
            literals: (Array.isArray(lits) ? lits.filter((x) => typeof x === "string") : []) as unknown,
            loc,
            isGhost: true,
          };
        } else if (cat === "Interface") {
          node = {
            key,
            name: String((p.args as Record<string, unknown>).name ?? key),
            category: "Interface",
            isAbstract: false,
            methods: (methods ?? []).map(toMethodData) as unknown,
            loc,
            isGhost: true,
          };
        } else {
          node = {
            key,
            name: String((p.args as Record<string, unknown>).name ?? key),
            category: "Class",
            isAbstract: isAbs,
            attributes: (attrs ?? []).map(toAttributeData) as unknown,
            methods: (methods ?? []).map(toMethodData) as unknown,
            loc,
            isGhost: true,
          };
        }
        model.addNodeData(node);
        ghostNodeKeys.add(key);
      } else if (p.toolName === "connect") {
        const fromRaw = (p.args as Record<string, unknown>).from;
        const toRaw = (p.args as Record<string, unknown>).to;
        const kind = (p.args as Record<string, unknown>).kind as string;
        if (fromRaw === undefined || toRaw === undefined || !kind) continue;
        const fromNorm = normalizeKey(fromRaw);
        const toNorm = normalizeKey(toRaw);
        const fromNode = model.nodeDataArray.find((n) => normalizeKey((n as { key?: unknown }).key) === fromNorm) as Record<string, unknown> | undefined;
        const toNode = model.nodeDataArray.find((n) => normalizeKey((n as { key?: unknown }).key) === toNorm) as Record<string, unknown> | undefined;
        const fromKey = fromNode ? String((fromNode as { key: unknown }).key) : fromNorm;
        const toKey = toNode ? String((toNode as { key: unknown }).key) : toNorm;
        const linkKey = `ghost-${p.id}`;
        const link: Record<string, unknown> = {
          key: linkKey,
          category: kind,
          from: fromKey,
          to: toKey,
          fromMultiplicity: (p.args as Record<string, unknown>).fromMult as string | undefined,
          toMultiplicity: (p.args as Record<string, unknown>).toMult as string | undefined,
          name: (p.args as Record<string, unknown>).label as string | undefined,
          isGhost: true,
        };
        model.addLinkData(link);
        ghostLinkKeys.add(linkKey);
      } else if (p.toolName === "rename") {
        const rawKey = String((p.args as Record<string, unknown>).key ?? "");
        const normKey = normalizeKey(rawKey);
        const node = model.nodeDataArray.find((n) => normalizeKey((n as { key?: unknown }).key) === normKey) as Record<string, unknown> | undefined;
        if (node) {
          ghostNodeKeys.add(`rename-${normKey}`);
        }
      }
      // otros tools (removeClass, updateAttribute, replaceAll, validate) no necesitan ghost visual
    }
  } finally {
    diagram.commitTransaction("ghostPreview");
  }
  // no auto-layout aquí: respeta loc de la IA (prompt) o auto-grid ya distribuido
}

export function clearGhostPreview(): void {
  const diagram = getDiagram();
  if (!diagram) {
    ghostNodeKeys.clear();
    ghostLinkKeys.clear();
    return;
  }
  const model = diagram.model as go.GraphLinksModel;
  if (ghostNodeKeys.size === 0 && ghostLinkKeys.size === 0) return;
  diagram.startTransaction("clearGhost");
  try {
    for (const key of Array.from(ghostLinkKeys)) {
      const data = model.linkDataArray.find((l) => (l as { key?: unknown }).key === key) as Record<string, unknown> | undefined;
      if (data) model.removeLinkData(data);
    }
    for (const key of Array.from(ghostNodeKeys)) {
      if (key.startsWith("rename-")) continue;
      const data = model.nodeDataArray.find((n) => (n as { key?: unknown }).key === key) as Record<string, unknown> | undefined;
      if (data) model.removeNodeData(data);
    }
  } finally {
    diagram.commitTransaction("clearGhost");
    ghostNodeKeys.clear();
    ghostLinkKeys.clear();
  }
}

export function confirmGhostPreview(): void {
  const diagram = getDiagram();
  if (!diagram) {
    ghostNodeKeys.clear();
    ghostLinkKeys.clear();
    return;
  }
  const model = diagram.model as go.GraphLinksModel;
  diagram.startTransaction("confirmGhost");
  try {
    for (const key of Array.from(ghostLinkKeys)) {
      const data = model.linkDataArray.find((l) => (l as { key?: unknown }).key === key) as Record<string, unknown> | undefined;
      if (data) {
        model.setDataProperty(data, "isGhost", false);
        // también actualizar key para que sea definitiva (quitamos prefijo ghost-)
        const newKey = (data as { key: string }).key.replace(/^ghost-/, "");
        // mantener ghost key por si ya existe? generamos nuevo UUID si colisión
        // por simplicidad dejamos ghost key como definitiva
      }
    }
    for (const key of Array.from(ghostNodeKeys)) {
      if (key.startsWith("rename-")) continue;
      const data = model.nodeDataArray.find((n) => (n as { key?: unknown }).key === key) as Record<string, unknown> | undefined;
      if (data) model.setDataProperty(data, "isGhost", false);
    }
  } finally {
    diagram.commitTransaction("confirmGhost");
    ghostNodeKeys.clear();
    ghostLinkKeys.clear();
  }
  // no forzar GridLayout si la IA decidió loc (respeta su distribución); si quieres reordenar manual usa el layout del editor
  // try { applyGridLayout(diagram); } catch {}
}

export function hasGhostPreview(): boolean {
  return ghostNodeKeys.size > 0 || ghostLinkKeys.size > 0;
}
