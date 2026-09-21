"use client";

import { RELATIONSHIP_PALETTE_ITEMS } from "@/lib/go/paletteData";
import type { UMLRelationType } from "@/types/uml";

interface RelationPickerProps {
  onSelect: (category: UMLRelationType) => void;
  onCancel: () => void;
}

const chipClass =
  "flex w-full items-center gap-2 rounded border px-3 py-2 text-left font-code-sm text-code-sm transition-colors hover:border-primary/50 hover:bg-surface-variant";

export default function RelationPicker({ onSelect, onCancel }: RelationPickerProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
      <div className="w-72 rounded-lg border border-outline-variant bg-surface-container-lowest p-4 shadow-xl">
        <h3 className="mb-1 font-class-name text-class-name text-on-surface">Elige relación</h3>
        <p className="mb-3 font-code-sm text-code-sm text-on-surface-variant">Se creó entre las dos cajas. ¿Qué tipo es?</p>
        <div className="flex flex-col gap-1.5">
          {RELATIONSHIP_PALETTE_ITEMS.map((rel) => (
            <button
              key={rel.key}
              onClick={() => onSelect(rel.category)}
              className={`${chipClass} border-outline-variant/60 bg-surface-container-low`}
            >
              <span className="text-primary">•</span>
              {rel.name}
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="mt-3 w-full rounded border border-outline-variant px-3 py-1.5 font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant hover:bg-surface-variant"
        >
          Cancelar (borra el conector)
        </button>
      </div>
    </div>
  );
}
