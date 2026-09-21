"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import DiagramEditor from "./DiagramEditor";
import type { AsistentePanelProps } from "../ia/AsistentePanel";
import type { GoJSCanvasHandle } from "./GoJSCanvas";
import { guardarColaboracion, listarMisProyectos, obtenerProyecto } from "@/lib/proyectos";
import type { Proyecto } from "@/types/proyecto";
import type { EstadoColaboracion } from "@/hooks/useColaboracion";
import { useAuth } from "@/hooks/useAuth";

const AsistentePanel = dynamic(() => import("../ia/AsistentePanel"), {
  ssr: false,
  loading: () => null,
}) as unknown as React.ComponentType<AsistentePanelProps>;

export default function EditorPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const canvasRef = useRef<GoJSCanvasHandle>(null);
  const { usuario } = useAuth();

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [esquemaInicial, setEsquemaInicial] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [rol, setRol] = useState<string | null>(null);
  const [estadoColab, setEstadoColab] = useState<EstadoColaboracion>({
    conexion: "conectando",
    synced: false,
    usuarios: 1,
    remoteUsers: [],
  });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function cargar() {
      setLoading(true);
      setError(null);
      try {
        const p = await obtenerProyecto(id);
        if (cancelled) return;
        setProyecto(p);
        setEsquemaInicial((p.esquemaJson as Record<string, unknown> | null) ?? null);
        // determinar rol para ocultar Guardar si es LECTOR
        try {
          const mis = await listarMisProyectos(1, 100);
          const found = mis.datos.find((r) => String(r.proyectoId) === String(id));
          if (found) setRol(found.rol);
          else if (usuario && p.creadorId === usuario.usuarioId) setRol("CREADOR");
          else setRol(null);
        } catch {
          setRol(null);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 401) router.push("/login");
        else if (status === 404) setError("Proyecto no encontrado (404).");
        else setError("No se pudo cargar el proyecto.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    cargar();
    return () => {
      cancelled = true;
    };
  }, [id, router, usuario]);

  const puedeEditar = rol === "CREADOR" || rol === "EDITOR";

  const handleGuardar = async () => {
    setSaving(true);
    try {
      await canvasRef.current?.esperarPersistenciaServidor();
      await guardarColaboracion(id);
      setToast({ type: "success", msg: "Guardado con éxito." });
      setTimeout(() => setToast(null), 2500);
      // recargar para confirmar persistencia (efímero → concreto)
      const p = await obtenerProyecto(id);
      setProyecto(p);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        setToast({ type: "error", msg: "Sesión expirada. Inicia sesión." });
        router.push("/login");
      } else if (status === 403) {
        setToast({ type: "error", msg: "Sin permisos (solo CREADOR/EDITOR puede guardar)." });
      } else if (status === 404) {
        setToast({ type: "error", msg: "Proyecto no existe." });
      } else {
        setToast({ type: "error", msg: "Error al guardar." });
      }
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-dvh min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-outline-variant/60 bg-surface px-4">
        <div className="flex items-center gap-3">
          <span className="font-code-sm text-code-sm text-on-surface-variant">
            Proyecto / {proyecto?.nombre ?? id} {loading && "· cargando..."}
          </span>
          <span className="flex items-center gap-1.5 rounded border border-primary/25 bg-surface-container-lowest px-2 py-0.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            <span className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-primary">
              Editor
            </span>
          </span>
          {proyecto && (
            <span
              className="flex items-center gap-1.5 rounded border border-outline-variant/60 bg-surface-container-lowest px-2 py-0.5 font-code-sm text-code-sm text-on-surface-variant"
              title="Sesión colaborativa en tiempo real"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  estadoColab.conexion === "conectado"
                    ? "bg-green-500"
                    : estadoColab.conexion === "conectando"
                      ? "animate-pulse bg-amber-400"
                      : "bg-red-500"
                }`}
              />
              {estadoColab.conexion === "conectado"
                ? estadoColab.usuarios > 1
                  ? `${estadoColab.usuarios} conectados`
                  : "En vivo"
                : estadoColab.conexion === "conectando"
                  ? "Conectando..."
                  : "Sin sesión"}
            </span>
          )}
          {error && <span className="font-code-sm text-code-sm text-red-600">{error}</span>}
          {toast && (
            <span
              className={`rounded px-2 py-1 font-code-sm text-code-sm ${
                toast.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
              }`}
            >
              {toast.msg}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {puedeEditar && (
            <button
              onClick={handleGuardar}
              disabled={saving || loading}
              className="rounded bg-primary px-4 py-1.5 font-badge-label text-badge-label font-bold uppercase tracking-wider text-white transition-opacity hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          )}
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-3 bg-[#2b2a28] text-on-primary">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-on-primary/25 border-t-primary-fixed" />
            Cargando diagrama...
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center bg-[#2b2a28] p-8 text-center text-red-400">{error}</div>
        ) : (
          <div className="flex h-full min-h-0">
            <div className="min-h-0 flex-1">
              <DiagramEditor
                ref={canvasRef}
                esquemaInicial={esquemaInicial}
                proyectoId={id}
                readOnly={!puedeEditar}
                nombreUsuario={usuario?.persona?.nombre}
                onEstadoColaboracion={setEstadoColab}
              />
            </div>
            <AsistentePanel readOnly={!puedeEditar} />
          </div>
        )}
      </main>
    </div>
  );
}
