"use client";

import { Save, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { crearVersion } from "@/lib/versiones";
import type { VersionProyecto } from "@/types/version";

interface GuardarVersionModalProps {
  open: boolean;
  onClose: () => void;
  proyectoId: string | number;
  nombreProyecto?: string;
  onBeforeSave?: () => Promise<void>;
  onSaved?: (version: VersionProyecto) => void;
}

export default function GuardarVersionModal({
  open,
  onClose,
  proyectoId,
  nombreProyecto,
  onBeforeSave,
  onSaved,
}: GuardarVersionModalProps) {
  const [nombre, setNombre] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  const cerrar = () => {
    setNombre("");
    setError(null);
    setSaving(false);
    onClose();
  };

  const handleGuardar = async () => {
    const trimmed = nombre.trim();
    if (!trimmed) {
      setError("Escribe un nombre para la versión");
      return;
    }
    if (trimmed.length > 100) {
      setError("Máximo 100 caracteres");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onBeforeSave?.();
      const version = await crearVersion(proyectoId, trimmed);
      onSaved?.(version);
      cerrar();
    } catch (err: unknown) {
      const s = (err as { response?: { status?: number } })?.response?.status;
      let m = "No se pudo guardar la versión";
      if (s === 400) m = "El proyecto todavía no tiene un diagrama";
      else if (s === 401) m = "Sesión expirada";
      else if (s === 403) m = "Solo el creador puede guardar versiones";
      else if (s === 404) m = "Proyecto no encontrado";
      setError(m);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-[#2B2A28]/60 backdrop-blur-sm animate-fade-in"
        onClick={cerrar}
      />
      <div className="relative z-10 w-full max-w-md rounded border border-outline-variant bg-surface shadow-[4px_4px_0px_0px_rgba(28,27,26,0.12)] animate-modal-in">
        <div className="flex items-center justify-between border-b border-outline-variant/40 bg-surface-container-low px-6 py-4">
          <div>
            <h2 className="font-headline-md text-headline-md font-bold text-on-surface">
              Guardar versión
            </h2>
            <p className="mt-1 font-code-sm text-code-sm text-on-surface-variant">
              {nombreProyecto ? `${nombreProyecto} · ` : ""}Elige un nombre para esta versión
            </p>
          </div>
          <button
            onClick={cerrar}
            className="flex h-8 w-8 items-center justify-center rounded text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-on-surface"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4 sm:p-6">
          <label className="font-code-sm text-code-sm text-on-surface-variant">
            Nombre de la versión
          </label>
          <input
            ref={inputRef}
            value={nombre}
            maxLength={100}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleGuardar();
              if (e.key === "Escape") cerrar();
            }}
            placeholder="Ej. Versión 1 - Entrega"
            className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface transition-all placeholder:text-outline/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {error && <p className="font-code-sm text-code-sm text-error">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-outline-variant/40 bg-surface-container-low px-6 py-4">
          <button
            onClick={cerrar}
            className="rounded border border-outline-variant px-4 py-2 font-class-name text-class-name text-on-surface transition-colors hover:bg-surface-variant"
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={saving}
            className="flex items-center gap-1.5 rounded bg-primary px-5 py-2 font-class-name text-class-name text-on-primary shadow-sm transition-colors hover:bg-on-primary-fixed-variant disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Guardando..." : "Guardar versión"}
          </button>
        </div>
      </div>
    </div>
  );
}
