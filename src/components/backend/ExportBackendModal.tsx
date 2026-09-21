"use client";

import { AlertTriangle, CheckCircle2, Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { obtenerProyecto } from "@/lib/proyectos";
import type { PreviewData } from "@/lib/generadorBackend/zipExporter";

interface ExportBackendModalProps {
  open: boolean;
  onClose: () => void;
  proyectoId: string | number;
  nombreProyecto: string;
}

export default function ExportBackendModal({
  open,
  onClose,
  proyectoId,
  nombreProyecto,
}: ExportBackendModalProps) {
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [esquema, setEsquema] = useState<Record<string, unknown> | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const recompute = async (
    esquemaJson: Record<string, unknown> | null,
    ov: Record<string, string>
  ) => {
    const { buildPreview } = await import("@/lib/generadorBackend/zipExporter");
    setPreview(buildPreview(esquemaJson, nombreProyecto, ov));
  };

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setOverrides({});
    setEsquema(null);
    (async () => {
      try {
        const proyecto = await obtenerProyecto(proyectoId);
        const eq = (proyecto.esquemaJson ?? null) as Record<string, unknown> | null;
        setEsquema(eq);
        await recompute(eq, {});
      } catch (err: unknown) {
        const m = err instanceof Error ? err.message : "No se pudo cargar el proyecto guardado.";
        setError(m);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, proyectoId]);

  const handleOverride = async (linkKey: string, ownerKey: string) => {
    const next = { ...overrides, [linkKey]: ownerKey };
    setOverrides(next);
    if (esquema !== undefined) await recompute(esquema, next);
  };

  const handleDownload = async () => {
    if (!preview || preview.entityCount === 0) return;
    setDownloading(true);
    setError(null);
    try {
      const { exportarSpringBootZip } = await import("@/lib/generadorBackend/zipExporter");
      const { toPackageSlug } = await import("@/lib/generadorBackend/utils");
      const blob = await exportarSpringBootZip(esquema, nombreProyecto, overrides);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${toPackageSlug(nombreProyecto)}-springboot.zip`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Error al generar el ZIP.";
      setError(m);
    } finally {
      setDownloading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-[#2B2A28]/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85dvh] w-full max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded border border-outline-variant bg-surface shadow-[4px_4px_0px_0px_rgba(28,27,26,0.12)] animate-modal-in sm:max-w-lg">
        <div className="flex items-center justify-between border-b border-outline-variant/40 bg-surface-container-low px-6 py-4">
          <div>
            <h2 className="font-headline-md text-headline-md font-bold text-on-surface">
              Exportar Backend Spring Boot
            </h2>
            <p className="mt-1 font-code-sm text-code-sm text-on-surface-variant">
              {nombreProyecto}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-on-surface"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
          <div className="flex items-start gap-2 rounded border border-amber-500/50 bg-amber-50 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="font-code-sm text-[12px] leading-5 text-amber-900">
              Se genera desde el <strong>último guardado</strong>. Los cambios del editor
              sin pulsar Guardar <strong>no</strong> están incluidos.
            </p>
          </div>

          {loading && (
            <p className="font-code-sm text-code-sm text-on-surface-variant">
              Analizando diagrama guardado...
            </p>
          )}
          {error && <p className="font-code-sm text-code-sm text-error">{error}</p>}

          {preview && (
            <>
              <div className="flex items-center gap-2 rounded border border-outline-variant/40 bg-surface-container-lowest px-3 py-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-700" />
                <p className="font-code-sm text-code-sm text-on-surface">
                  {preview.entityCount} entidades, {preview.relationCount} relaciones FK,{" "}
                  {preview.model.enums.length} enumeraciones.
                </p>
              </div>

              {preview.model.fkChoices.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="font-class-name text-[12px] font-bold uppercase tracking-wider text-on-surface">
                    Claves foráneas
                  </h3>
                  {preview.model.fkChoices.map((f) => {
                    const ownerIsFrom = f.ownerKey === f.fromKey;
                    const ownerName = ownerIsFrom ? f.fromName : f.toName;
                    const targetName = ownerIsFrom ? f.toName : f.fromName;
                    return (
                      <div
                        key={f.linkKey}
                        className="rounded border border-outline-variant/40 bg-surface-container-lowest p-2.5"
                      >
                        <p className="font-code-sm text-code-sm text-on-surface">
                          {ownerName}.{f.columnName} → {targetName}.id{" "}
                          <span className="text-on-surface-variant">({f.kindLabel})</span>
                        </p>
                        {f.ambiguous && (
                          <div className="mt-1.5 flex flex-col gap-1">
                            <span className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-amber-700">
                              Relación 1:1 — elige dónde va la FK
                            </span>
                            <label className="flex items-center gap-2 font-code-sm text-code-sm text-on-surface">
                              <input
                                type="radio"
                                name={`fk-${f.linkKey}`}
                                checked={f.ownerKey === f.fromKey}
                                onChange={() => handleOverride(f.linkKey, f.fromKey)}
                                className="h-4 w-4 accent-[#006877]"
                              />
                              En {f.fromName}
                            </label>
                            <label className="flex items-center gap-2 font-code-sm text-code-sm text-on-surface">
                              <input
                                type="radio"
                                name={`fk-${f.linkKey}`}
                                checked={f.ownerKey === f.toKey}
                                onChange={() => handleOverride(f.linkKey, f.toKey)}
                                className="h-4 w-4 accent-[#006877]"
                              />
                              En {f.toName}
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </section>
              )}

              {preview.model.skipped.length > 0 && (
                <section className="flex flex-col gap-1">
                  <h3 className="font-class-name text-[12px] font-bold uppercase tracking-wider text-on-surface">
                    Omitidos
                  </h3>
                  {preview.model.skipped.map((s, i) => (
                    <p key={i} className="font-code-sm text-[12px] text-on-surface-variant">
                      · {s}
                    </p>
                  ))}
                </section>
              )}

              {preview.model.warnings.length > 0 && (
                <section className="flex flex-col gap-1">
                  <h3 className="font-class-name text-[12px] font-bold uppercase tracking-wider text-on-surface">
                    Avisos del generador
                  </h3>
                  {preview.model.warnings.map((w, i) => (
                    <p key={i} className="font-code-sm text-[12px] text-on-surface-variant">
                      · {w}
                    </p>
                  ))}
                </section>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-outline-variant/40 bg-surface-container-low px-6 py-4">
          <button
            onClick={onClose}
            className="rounded border border-outline-variant px-4 py-2 font-class-name text-class-name text-on-surface transition-colors hover:bg-surface-variant"
          >
            Cerrar
          </button>
          <button
            onClick={handleDownload}
            disabled={!preview || preview.entityCount === 0 || downloading || loading}
            className="flex items-center gap-1.5 rounded bg-primary px-5 py-2 font-class-name text-class-name text-on-primary shadow-sm transition-colors hover:bg-on-primary-fixed-variant disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {downloading ? "Generando..." : "Descargar ZIP"}
          </button>
        </div>
      </div>
    </div>
  );
}