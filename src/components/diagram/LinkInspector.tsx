"use client";

import { X } from "lucide-react";
import { RELATIONSHIP_PALETTE_ITEMS } from "@/lib/go/paletteData";
import type { Multiplicity, RelationshipLinkData, UMLRelationType } from "@/types/uml";

const fieldClass =
  "min-w-0 flex-1 rounded border border-outline-variant bg-surface-container-lowest px-2 py-0.5 font-code-sm text-code-sm text-on-surface transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-outline/70";
const selectClass =
  "rounded border border-outline-variant bg-surface-container-lowest px-1 py-0.5 font-code-sm text-code-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const iconButton =
  "rounded border border-outline-variant/60 p-0.5 text-on-surface-variant transition-colors hover:bg-surface-variant";

const MULTIPLICITY_OPTIONS: (Multiplicity | "")[] = ["", "1", "0..1", "*", "0..*", "1..*"];

interface LinkInspectorProps {
  data: RelationshipLinkData;
  onChange: (updates: Record<string, unknown>) => void;
  onClose: () => void;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-1 font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
      {children}
    </h4>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5 rounded border border-outline-variant/40 bg-surface-container-lowest p-2">
      {children}
    </section>
  );
}

export default function LinkInspector({ data, onChange, onClose }: LinkInspectorProps) {
  const commit = (updates: Record<string, unknown>) => onChange(updates);
  const showEnds = data.category === "association" || data.category === "aggregation" || data.category === "composition";

  return (
    <aside className="flex h-full w-full flex-col gap-2 overflow-y-auto bg-surface-container-low p-2">
      <div className="flex shrink-0 items-center justify-between">
        <h3 className="truncate font-badge-label text-badge-label text-on-surface">
          Relación · {data.from} → {data.to}
        </h3>
        <button onClick={onClose} className={iconButton} title="Cerrar">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <SectionTitle>Tipo</SectionTitle>
          <label className="flex flex-col gap-1">
            <span className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
              Categoría
            </span>
            <select
              value={data.category}
              onChange={(e) => commit({ category: e.target.value as UMLRelationType })}
              className={selectClass}
            >
              {RELATIONSHIP_PALETTE_ITEMS.map((r) => (
                <option key={r.key} value={r.category}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
              Etiqueta central
            </span>
            <input
              type="text"
              value={data.name ?? ""}
              onChange={(e) => commit({ name: e.target.value || undefined })}
              className={fieldClass}
              placeholder="ej. trabaja en, «use»"
            />
          </label>
          <p className="font-code-sm text-code-sm leading-5 text-on-surface-variant/70">
            {data.category === "aggregation" && "Rombo hueco en el TODO (from)."}
            {data.category === "composition" && "Rombo relleno en el TODO (from)."}
            {data.category === "generalization" && "Triángulo hueco hacia la superclase (to)."}
            {data.category === "realization" && "Línea discontinua + triángulo hueco."}
            {data.category === "dependency" && "Línea discontinua + flecha abierta."}
            {data.category === "association" && "Línea sólida; roles y multiplicidades en extremos."}
          </p>
        </Card>

        {showEnds ? (
          <>
            <Card>
              <SectionTitle>Origen (from)</SectionTitle>
              <label className="flex flex-col gap-1">
                <span className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
                  Rol
                </span>
                <input
                  type="text"
                  value={data.fromRole ?? ""}
                  onChange={(e) => commit({ fromRole: e.target.value || undefined })}
                  className={fieldClass}
                  placeholder="ej. +empleador"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
                  Multiplicidad
                </span>
                <select
                  value={data.fromMultiplicity ?? ""}
                  onChange={(e) => commit({ fromMultiplicity: e.target.value || undefined })}
                  className={selectClass}
                >
                  {MULTIPLICITY_OPTIONS.map((m) => (
                    <option key={m || "empty"} value={m}>
                      {m === "" ? "(vacía)" : m}
                    </option>
                  ))}
                </select>
              </label>
              <input
                type="text"
                value={data.fromMultiplicity ?? ""}
                onChange={(e) => commit({ fromMultiplicity: e.target.value || undefined })}
                className={fieldClass}
                placeholder="o escribe 2..5"
              />
            </Card>

            <Card>
              <SectionTitle>Destino (to)</SectionTitle>
              <label className="flex flex-col gap-1">
                <span className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
                  Rol
                </span>
                <input
                  type="text"
                  value={data.toRole ?? ""}
                  onChange={(e) => commit({ toRole: e.target.value || undefined })}
                  className={fieldClass}
                  placeholder="ej. +empleado"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
                  Multiplicidad
                </span>
                <select
                  value={data.toMultiplicity ?? ""}
                  onChange={(e) => commit({ toMultiplicity: e.target.value || undefined })}
                  className={selectClass}
                >
                  {MULTIPLICITY_OPTIONS.map((m) => (
                    <option key={m || "empty"} value={m}>
                      {m === "" ? "(vacía)" : m}
                    </option>
                  ))}
                </select>
              </label>
              <input
                type="text"
                value={data.toMultiplicity ?? ""}
                onChange={(e) => commit({ toMultiplicity: e.target.value || undefined })}
                className={fieldClass}
                placeholder="o escribe 0..*"
              />
            </Card>
          </>
        ) : (
          <Card>
            <SectionTitle>Extremos</SectionTitle>
            <p className="font-code-sm text-code-sm text-on-surface-variant/70">
              Generalización / Realización / Dependencia no llevan roles ni multiplicidades según UML 2.5. Solo cambia el tipo si lo necesitas.
            </p>
          </Card>
        )}
      </div>
    </aside>
  );
}
