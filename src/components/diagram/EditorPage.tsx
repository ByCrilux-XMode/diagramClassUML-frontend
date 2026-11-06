"use client";

import { useEffect, useRef, useState } from "react";
import { FileClock, Users } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import DiagramEditor from "./DiagramEditor";
import type { AsistentePanelProps } from "../ia/AsistentePanel";
import type { GoJSCanvasHandle } from "./GoJSCanvas";
import ViewDetailsModal from "../projects/ViewDetailsModal";
import HelpAssistant from "../ayuda/HelpAssistant";
import { guardarColaboracion, listarMisProyectos, obtenerProyecto } from "@/lib/proyectos";
import { crearVersion } from "@/lib/versiones";
import type { Proyecto, RolProyecto } from "@/types/proyecto";
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
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [nombreVersion, setNombreVersion] = useState("");
  const [descripcionVersion, setDescripcionVersion] = useState("");
  const [creandoVersion, setCreandoVersion] = useState(false);
  const [errorVersion, setErrorVersion] = useState<string | null>(null);
  const [estadoColab, setEstadoColab] = useState<EstadoColaboracion>({
    conexion: "conectando",
    synced: false,
    usuarios: 1,
    remoteUsers: [],
  });
  const [colaboradoresAbierto, setColaboradoresAbierto] = useState(false);

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

  const abrirModalVersion = () => {
    setNombreVersion("");
    setDescripcionVersion("");
    setErrorVersion(null);
    setVersionModalOpen(true);
  };

  const cerrarModalVersion = () => {
    if (creandoVersion) return;
    setVersionModalOpen(false);
    setErrorVersion(null);
  };

  const handleCrearVersion = async () => {
    const nombre = nombreVersion.trim();
    const descripcion = descripcionVersion.trim();
    if (nombre.length > 150) {
      setErrorVersion("El nombre admite máximo 150 caracteres.");
      return;
    }
    if (descripcion.length > 1000) {
      setErrorVersion("La descripción admite máximo 1000 caracteres.");
      return;
    }
    setCreandoVersion(true);
    setErrorVersion(null);
    try {
      // Espera a que el estado colaborativo termine de persistirse en el backend.
      await canvasRef.current?.esperarPersistenciaServidor();
      const version = await crearVersion(id, { nombre, descripcion });
      setVersionModalOpen(false);
      setNombreVersion("");
      setDescripcionVersion("");
      setToast({ type: "success", msg: `Versión "${version.nombre}" creada.` });
      setTimeout(() => setToast(null), 3000);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        setToast({ type: "error", msg: "Sesión expirada. Inicia sesión." });
        setTimeout(() => setToast(null), 3000);
        router.push("/login");
        return;
      }
      let m = "No se pudo crear la versión.";
      if (status === 403) m = "Sin permisos (solo CREADOR/EDITOR puede crear versiones).";
      else if (status === 404) m = "Proyecto no encontrado.";
      else if (status === 400) m = "Datos inválidos.";
      setErrorVersion(m);
    } finally {
      setCreandoVersion(false);
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
              onClick={abrirModalVersion}
              disabled={saving || loading || creandoVersion}
              className="flex items-center gap-1.5 rounded border border-outline-variant bg-surface-container-lowest px-3 py-1.5 font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface transition-colors hover:border-primary hover:bg-surface-variant disabled:opacity-50"
              title="Guardar una versión del diagrama"
            >
              <FileClock className="h-4 w-4" />
              {creandoVersion ? "Creando..." : "Nueva versión"}
            </button>
          )}
          {puedeEditar && (
            <button
              onClick={handleGuardar}
              disabled={saving || loading}
              className="rounded bg-primary px-4 py-1.5 font-badge-label text-badge-label font-bold uppercase tracking-wider text-white transition-opacity hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          )}
          <button
            onClick={() => setColaboradoresAbierto(true)}
            disabled={loading}
            className="flex items-center gap-1.5 rounded bg-secondary px-4 py-1.5 font-badge-label text-badge-label font-bold uppercase tracking-wider text-white transition-opacity hover:bg-secondary/90 disabled:opacity-50"
            title="Gestionar colaboradores del proyecto"
          >
            <Users className="h-3.5 w-3.5" />
            Colaboradores
          </button>
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
                usuarioId={usuario?.usuarioId}
                onEstadoColaboracion={setEstadoColab}
              />
            </div>
            <AsistentePanel
              readOnly={!puedeEditar}
              proyectoId={id}
              usuarioId={usuario?.usuarioId}
              usuarioNombre={usuario?.persona?.nombre}
              rol={rol}
            />
          </div>
        )}
      </main>

      {versionModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
          <div
            className="absolute inset-0 bg-[#2B2A28]/60 backdrop-blur-sm"
            onClick={cerrarModalVersion}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-nueva-version"
            className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded border border-outline-variant bg-surface shadow-[4px_4px_0px_0px_rgba(28,27,26,0.12)]"
          >
            <div className="flex items-center justify-between border-b border-outline-variant/40 bg-surface-container-low px-5 py-3.5">
              <div className="flex items-center gap-2">
                <FileClock className="h-4 w-4 text-on-surface-variant" />
                <h2
                  id="titulo-nueva-version"
                  className="font-headline-md text-headline-md font-bold text-on-surface"
                >
                  Nueva versión
                </h2>
              </div>
              <button
                onClick={cerrarModalVersion}
                disabled={creandoVersion}
                className="flex h-8 w-8 items-center justify-center rounded text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-on-surface disabled:opacity-50"
                aria-label="Cerrar"
              >
                <span aria-hidden className="text-xl leading-none">
                  ×
                </span>
              </button>
            </div>

            <div className="flex flex-col gap-4 p-5">
              <p className="font-code-sm text-[12px] text-on-surface-variant">
                Guarda una copia del esquema actual. El nombre y la descripción son
                opcionales; si omites el nombre, el backend usará «Versión N».
              </p>

              <div>
                <label className="mb-1 flex items-center justify-between font-code-sm text-code-sm text-on-surface-variant">
                  <span>Nombre</span>
                  <span className="text-outline">{nombreVersion.length}/150</span>
                </label>
                <input
                  value={nombreVersion}
                  onChange={(e) => setNombreVersion(e.target.value)}
                  maxLength={150}
                  placeholder="Entrega parcial"
                  className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="mb-1 flex items-center justify-between font-code-sm text-code-sm text-on-surface-variant">
                  <span>Descripción</span>
                  <span className="text-outline">{descripcionVersion.length}/1000</span>
                </label>
                <textarea
                  value={descripcionVersion}
                  onChange={(e) => setDescripcionVersion(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Versión antes de la revisión."
                  className="w-full resize-none rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {errorVersion && (
                <p className="font-code-sm text-code-sm text-error">{errorVersion}</p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-outline-variant/40 bg-surface-container-low px-5 py-3.5">
              <button
                onClick={cerrarModalVersion}
                disabled={creandoVersion}
                className="rounded border border-outline-variant px-4 py-2 font-class-name text-class-name text-on-surface transition-colors hover:bg-surface-variant disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCrearVersion}
                disabled={creandoVersion}
                className="flex items-center gap-1.5 rounded bg-primary px-4 py-2 font-class-name text-class-name text-on-primary shadow-sm transition-colors hover:bg-on-primary-fixed-variant disabled:opacity-50"
              >
                <FileClock className="h-4 w-4" />
                {creandoVersion ? "Creando..." : "Crear versión"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ViewDetailsModal
        open={colaboradoresAbierto}
        onClose={() => setColaboradoresAbierto(false)}
        proyectoId={Number(id)}
        nombreInicial={proyecto?.nombre ?? ""}
        rol={(rol as RolProyecto | null) ?? undefined}
        solo="colaboradores"
      />

      {/* Chat de ayuda sobre la web (no sobre el diagrama). */}
      <HelpAssistant desplazado />
    </div>
  );
}
