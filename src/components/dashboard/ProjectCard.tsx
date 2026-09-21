"use client";

import { useState } from "react";
import { Clock3, MoreVertical } from "lucide-react";

export interface ProjectCollab {
  initials: string;
  colorClass: string;
}

export interface ProjectCardData {
  id: number;
  name: string;
  description: string;
  timeAgo: string;
  collaborators: ProjectCollab[];
  variant: "class" | "composition" | "interface";
  className: string;
  secondClassName?: string;
  relationship?: string;
  multiplicity?: string;
  badge?: string;
  onClick?: () => void;
  className2?: string;
  onDelete?: (id:number) => void; //aqui dira que hacer cuando se pulse el eliminar 
  onViewDetails?: (id:number) => void;
  rol?: "CREADOR"|"EDITOR"|"LECTOR";
  deleting?: boolean;
}

function MiniPreview({ data }: { data: ProjectCardData }) {
  const baseBox =
    "bg-surface-container-lowest border border-outline rounded-sm shadow-sm flex flex-col";
  const headerBox =
    "bg-surface-variant py-1 px-2 border-b border-outline flex justify-center";

  return (
    <div className="relative flex flex-col gap-4 scale-75 items-center opacity-80 transition-opacity group-hover:opacity-100">
      {data.variant === "class" && (
        <>
          <div className={`${baseBox} w-32`}>
            <div className={headerBox}>
              <span className="font-class-name text-[10px] text-on-surface">
                {data.className}
              </span>
            </div>
            <div className="flex flex-col gap-1 p-2">
              <div className="h-1 w-3/4 rounded bg-outline-variant" />
              <div className="h-1 w-1/2 rounded bg-outline-variant" />
            </div>
          </div>
          <div className="flex gap-4">
            <div className={`${baseBox} w-24 relative`}>
              <div className="absolute -top-4 left-1/2 h-4 w-px bg-outline" />
              <div className={headerBox}>
                <span className="font-class-name text-[10px] text-on-surface">
                  {data.secondClassName}
                </span>
              </div>
              <div className="flex flex-col gap-1 p-2">
                <div className="h-1 w-full rounded bg-outline-variant" />
              </div>
            </div>
            <div className={`${baseBox} w-24 relative`}>
              <div className="absolute -top-4 left-1/2 h-4 w-px bg-outline" />
              <div className={headerBox}>
                <span className="font-class-name text-[10px] text-on-surface">
                  {data.className2}
                </span>
              </div>
              <div className="flex flex-col gap-1 p-2">
                <div className="h-1 w-2/3 rounded bg-outline-variant" />
              </div>
            </div>
          </div>
        </>
      )}

      {data.variant === "composition" && (
        <div className="flex flex-row items-center gap-6">
          <div className={`${baseBox} w-28`}>
            <div className={headerBox}>
              <span className="font-class-name text-[10px] text-on-surface">
                {data.className}
              </span>
            </div>
            <div className="flex flex-col gap-1 p-2">
              <div className="h-1 w-full rounded bg-outline-variant" />
              <div className="h-1 w-3/4 rounded bg-outline-variant" />
              <div className="h-1 w-1/2 rounded bg-outline-variant" />
            </div>
          </div>
          <div className="relative h-px w-10 bg-outline">
            <div className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-t border-r border-outline bg-surface-container-lowest" />
            {data.multiplicity && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-[2px] bg-secondary px-1 font-badge-label text-[8px] text-on-secondary">
                {data.multiplicity}
              </div>
            )}
          </div>
          <div className={`${baseBox} w-28`}>
            <div className={headerBox}>
              <span className="font-class-name text-[10px] text-on-surface">
                {data.secondClassName}
              </span>
            </div>
            <div className="flex flex-col gap-1 p-2">
              <div className="h-1 w-2/3 rounded bg-outline-variant" />
            </div>
          </div>
        </div>
      )}

      {data.variant === "interface" && (
        <div className="flex flex-col items-center gap-6">
          <div className="w-32 rounded-sm border-2 border-dashed border-outline bg-surface-container-lowest opacity-70 shadow-sm">
            <div className="border-b border-dashed border-outline py-1 px-2 text-center">
              <span className="font-class-name text-[10px] italic text-on-surface">
                {"«interface» " + data.className}
              </span>
            </div>
          </div>
          <div className="relative h-6 w-px border-l border-dashed border-outline">
            <div className="absolute -bottom-1 left-1/2 h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-outline" />
          </div>
          <div className={`${baseBox} w-28`}>
            <div className={headerBox}>
              <span className="font-class-name text-[10px] text-on-surface">
                {data.secondClassName}
              </span>
            </div>
            <div className="flex flex-col gap-1 p-2">
              <div className="h-1 w-full rounded bg-outline-variant" />
              <div className="h-1 w-1/2 rounded bg-outline-variant" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectCard({ data }: { data: ProjectCardData }) {
  const [menu, setMenu] = useState(false);

  return (
    <div
      onClick={data.onClick}
      className="group relative flex h-72 cursor-pointer flex-col overflow-hidden rounded border border-outline-variant/50 bg-surface-container-lowest shadow-[0_4px_12px_rgba(28,27,26,0.03)] transition-all duration-300 hover:border-primary/50 hover:shadow-[0_8px_24px_rgba(28,27,26,0.08)]"
    >
      {/* Mini Preview Canvas */}
      <div className="relative flex h-40 items-center justify-center overflow-hidden bg-surface-container-low border-b border-outline-variant/30">
        <div className="grid-lines absolute inset-0 opacity-50" />
        {data.badge && (
          <div className="absolute left-2.5 top-2.5 z-20 flex items-center gap-1.5 rounded border border-outline-variant/40 bg-surface-container-lowest/90 px-2 py-0.5 shadow-sm backdrop-blur-sm">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            <span className="font-badge-label text-[10px] font-bold uppercase tracking-wider text-primary">
              Editor
            </span>
          </div>
        )}
        <div className="relative z-10">
          <MiniPreview data={data} />
        </div>
      </div>

      {/* Card Details */}
      <div className="flex flex-1 flex-col justify-between bg-[#FAF9F7] p-4">
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <div className="mb-1 flex items-start justify-between">
            <h3 className="truncate pr-2 font-class-name text-class-name text-on-surface transition-colors group-hover:text-primary">
              {data.name}
            </h3>
            <button
              className="text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-100 hover:text-on-surface"
              onClick={() => setMenu((v) => !v)}
              aria-label="Más opciones"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
          <p className="truncate font-code-sm text-code-sm text-on-surface-variant">
            {data.description}
          </p>

        </div>

          {menu && (
            <div className="absolute max-sm:right-10 sm:right-10 md:right-9 top-40 z-20 flex w-40 flex-col rounded border border-outline-variant bg-surface-container-lowest py-2 shadow-lg">
              <button
                className="px-3 py-1.5 text-left font-code-sm text-code-sm text-on-surface hover:bg-surface-variant"
                onClick={(e) => {
                  e.stopPropagation();
                  data.onClick?.();
                  setMenu(false);
                }}
              >
                Abrir
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenu(false);
                  data.onViewDetails?.(data.id);
                }}
                className="px-3 py-1.5 text-left font-code-sm text-code-sm text-on-surface hover:bg-surface-variant"
              >
                Ver Detalles
              </button>
              <button
                disabled={data.deleting}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenu(false);
                  data.onDelete?.(data.id)
                }} 
                className="px-3 py-1.5 text-left font-code-sm text-code-sm text-error hover:bg-error-container/30"
                >
                {data.deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          )}
          
        <div className="mt-4 flex items-center justify-between border-t border-outline-variant/30 pt-3">
          <span className="flex items-center gap-1 font-code-sm text-code-sm text-on-surface-variant/70">
            <Clock3 className="h-3.5 w-3.5" />
            {data.timeAgo}
          </span>
          <div className="flex -space-x-2">
            {data.collaborators.map((c) => (
              <div
                key={c.initials}
                className={`z-20 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface-container-lowest text-[10px] font-bold ${c.colorClass}`}
              >
                {c.initials}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Render menu outside nested interactive container safely */}
    </div>
  );
}
