"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { RELATIONSHIP_PALETTE_ITEMS } from "@/lib/go/paletteData";
import type { NodeCategory, UMLRelationType } from "@/types/uml";
import type * as go from "gojs";

interface ClassPaletteProps {
  nodeTemplateMap?: go.Map<string, go.Node>;
  activeRelation: UMLRelationType | null;
  onSelectRelation: (category: UMLRelationType) => void;
}

const sectionTitle =
  "mb-1.5 flex items-center gap-1.5 font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant";

const chipClass =
  "flex w-full items-center gap-2 rounded border px-2 py-1 font-code-sm text-code-sm text-on-surface transition-colors cursor-grab active:cursor-grabbing";

const svgBase = { width: 48, height: 14, viewBox: "0 0 48 14", className: "shrink-0" };

const NODE_ITEMS: { key: string; category: NodeCategory; label: string; sub: string }[] = [
  { key: "node-class", category: "Class", label: "Clase", sub: "Atributos + Métodos" },
  { key: "node-interface", category: "Interface", label: "Interfaz", sub: "«interface»" },
  { key: "node-enum", category: "Enum", label: "Enum", sub: "«enumeration»" },
];

function RelationGlyph({ category }: { category: UMLRelationType }) {
  const stroke = "currentColor";
  // Fiel a GoJS 4: StretchedDiamond/Triangle con fill SURFACE (#fdf9f5) para huecos
  if (category === "association") {
    return (
      <svg {...svgBase}>
        <line x1="0" y1="7" x2="48" y2="7" stroke={stroke} strokeWidth="1.5" />
      </svg>
    );
  }
  if (category === "aggregation" || category === "composition") {
    const isAgg = category === "aggregation";
    // StretchedDiamond real: ancho 14, alto 12, centrado en 7,7
    return (
      <svg {...svgBase}>
        <polygon
          points="2,7 8,0 14,7 8,14"
          fill={isAgg ? "#fdf9f5" : "currentColor"}
          stroke={stroke}
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <line x1="14" y1="7" x2="48" y2="7" stroke={stroke} strokeWidth="1.5" />
      </svg>
    );
  }
  if (category === "generalization" || category === "realization") {
    const dashed = category === "realization";
    return (
      <svg {...svgBase}>
        <line
          x1="0"
          y1="7"
          x2="30"
          y2="7"
          stroke={stroke}
          strokeWidth="1.5"
          strokeDasharray={dashed ? "4 2" : undefined}
        />
        <polygon
          points="30,0 30,14 42,7"
          fill="#fdf9f5"
          stroke={stroke}
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  // dependency: OpenTriangle (chevron) + dashed
  return (
    <svg {...svgBase}>
      <line x1="0" y1="7" x2="36" y2="7" stroke={stroke} strokeWidth="1.5" strokeDasharray="4 2" />
      <path d="M36,1 L42,7 L36,13" fill="none" stroke={stroke} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

export default function ClassPalette({
  activeRelation,
  onSelectRelation,
}: ClassPaletteProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <aside className="flex h-full min-h-0 w-14 shrink-0 flex-col items-center gap-3 border-r border-outline-variant/60 bg-surface-container-low p-2">
        <button
          onClick={() => setCollapsed(false)}
          className="rounded p-1.5 text-on-surface-variant hover:bg-surface-variant"
          title="Expandir paleta"
        >
          <PanelLeftOpen className="h-5 w-5" />
        </button>
        <div className="flex flex-col gap-2">
          {NODE_ITEMS.map((n) => (
            <div key={n.key} className="h-8 w-8 rounded border border-outline-variant/40 bg-surface-container-lowest" title={n.label} />
          ))}
        </div>
        <div className="mt-2 h-px w-8 bg-outline-variant/40" />
        <div className="flex flex-col gap-1">
          {RELATIONSHIP_PALETTE_ITEMS.map((r) => (
            <div key={r.key} className="h-6 w-8 rounded bg-surface-container-lowest" title={r.name} />
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 w-60 shrink-0 flex-col gap-4 overflow-y-auto border-r border-outline-variant/60 bg-surface-container-low p-3">
      <section>
        <h2 className={`${sectionTitle} justify-between`}>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Elementos
          </span>
          <button
            onClick={() => setCollapsed(true)}
            className="rounded p-1 text-on-surface-variant hover:bg-surface-variant"
            title="Colapsar paleta"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </h2>
        <div className="flex flex-col gap-3">
          {NODE_ITEMS.map((item) => (
            <button
              key={item.key}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-node-category", item.category);
                e.dataTransfer.effectAllowed = "copy";
              }}
              className="w-full cursor-grab active:cursor-grabbing p-1"
              title="Arrastra al lienzo para crear"
            >
              <div className="flex h-14 w-full flex-col items-center justify-center rounded-sm border border-[#1c1b1a] bg-[#fdf9f5] shadow-[0_2px_6px_rgba(0,0,0,0.18)]">
                {item.category === "Class" ? (
                  <span className="text-sm font-bold text-[#1c1b1a]">Clase</span>
                ) : item.category === "Interface" ? (
                  <>
                    <span className="text-[11px] italic text-[#3c494c]">«interface»</span>
                    <span className="text-sm font-bold text-[#1c1b1a]">Interfaz</span>
                  </>
                ) : (
                  <>
                    <span className="text-[11px] italic text-[#3c494c]">«enumeration»</span>
                    <span className="text-sm font-bold text-[#1c1b1a]">Enum</span>
                  </>
                )}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className={sectionTitle}>
          <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
          Relaciones
        </h2>
        <div className="flex flex-col gap-1.5">
          {RELATIONSHIP_PALETTE_ITEMS.map((rel) => {
            const active = activeRelation === rel.category;
            return (
              <button
                key={rel.key}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", rel.category);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => onSelectRelation(rel.category)}
                className={`${chipClass} ${
                  active
                    ? "border-primary bg-primary text-white"
                    : "border-outline-variant/60 bg-surface-container-lowest hover:border-primary/50"
                }`}
                title="Arrastra al lienzo, o haz clic para dibujar la relación entre dos cajas (Esc cancela)"
              >
                <span className={active ? "text-white" : "text-primary"}>
                  <RelationGlyph category={rel.category} />
                </span>
                {rel.name}
              </button>
            );
          })}
        </div>
        {activeRelation && (
          <p className="mt-2 font-code-sm text-code-sm text-primary">
            Modo {activeRelation}: dibuja de borde a borde · Esc cancela
          </p>
        )}
      </section>

      <p className="mt-auto px-1 font-code-sm text-code-sm leading-5 text-on-surface-variant/70">
        Arrastra una caja para moverla. Arrastra un puerto del borde para relacionar.
      </p>
    </aside>
  );
}
