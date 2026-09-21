"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Filter,
  FolderOpen,
  Grid2x2,
  Search,
  UserRound,
} from "lucide-react";
import ProjectCard, {
  type ProjectCardData,
} from "@/components/dashboard/ProjectCard";
import ViewDetailsModal from "@/components/projects/ViewDetailsModal";
import HelpAssistant from "@/components/ayuda/HelpAssistant";
import { eliminarProyecto, listarMisProyectos } from "@/lib/proyectos";
import type { ProyectoResumen, RolProyecto } from "@/types/proyecto";
import { useAuth } from "@/hooks/useAuth";

const ROL_LABEL: Record<RolProyecto, string> = {
  CREADOR: "Creador",
  EDITOR: "Colaborador · Editor",
  LECTOR: "Colaborador · Lector",
};

export default function ProyectosDashboard() {
  const { setProyectos, refreshKey } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataCache, setDataCache] = useState<ProyectoResumen[]>([]);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { datos } = await listarMisProyectos(1, 100);
      setProyectos(
        datos.map((p) => ({ proyectoId: p.proyectoId, nombre: p.nombre }))
      );
      setDataCache(datos);
      setLoading(false);
    } catch {
      setError("No se pudieron cargar los proyectos.");
      setLoading(false);
    }
  }, [setProyectos]);

  useEffect(() => {
    // Fetch on mount / refresh: reads external API and syncs into state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar, refreshKey]);

  const filtrar = (lista: ProyectoResumen[]) =>
    lista.filter((p) =>
      p.nombre.toLowerCase().includes(query.toLowerCase())
    );

  const mios = filtrar(dataCache.filter((p) => p.rol === "CREADOR"));
  const colaboracion = filtrar(
    dataCache.filter((p) => p.rol !== "CREADOR")
  );
  
  const aCard = (p: ProyectoResumen): ProjectCardData => ({
    id: p.proyectoId,
    name: p.nombre,
    description: ROL_LABEL[p.rol],
    timeAgo: `ID: ${p.proyectoId}`,
    collaborators: [],
    variant: "class",
    className: p.nombre,
    onClick: () => router.push(`/editor/${p.proyectoId}`),
    rol: p.rol,
    deleting: deletingId === p.proyectoId,
    onDelete: (id) => setConfirmId(id as number),
    onViewDetails: (id) => setViewId(id as number),
  });

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await eliminarProyecto(id);
      const nextCache = dataCache.filter((p) => p.proyectoId !== id);
      setDataCache(nextCache);
      setProyectos(nextCache.map((p) => ({ proyectoId: p.proyectoId, nombre: p.nombre })));
      setConfirmId(null);
      setToast({ type: "success", msg: "Proyecto eliminado" });
      setTimeout(() => setToast(null), 2500);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401) {
        setToast({ type: "error", msg: "Sesión expirada. Inicia sesión." });
        router.push("/login");
      } else if (status === 403) {
        setToast({ type: "error", msg: "Solo el creador puede eliminar (403)" });
      } else if (status === 404) {
        const nextCache = dataCache.filter((p) => p.proyectoId !== id);
        setDataCache(nextCache);
        setProyectos(nextCache.map((p) => ({ proyectoId: p.proyectoId, nombre: p.nombre })));
        setToast({ type: "error", msg: "Ya no existe (404)" });
      } else {
        setToast({ type: "error", msg: "Error al eliminar" });
      }
      setTimeout(() => setToast(null), 3000);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#2b2a28] p-8">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-on-primary/25 border-t-primary-fixed" />
          <p className="font-code-sm text-code-sm text-on-primary">Cargando proyectos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex flex-col items-center gap-4 rounded border border-error/30 bg-error-container/20 p-8 text-center">
          <p className="font-class-name text-class-name text-error">{error}</p>
          <button
            onClick={cargar}
            className="rounded border border-primary px-4 py-2 font-class-name text-class-name text-primary transition-colors hover:bg-primary/10"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-40 isolate border-b border-outline-variant/30 bg-surface/90 px-8 py-8 backdrop-blur-sm md:py-10">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="mb-2 text-headline-lg tracking-tight text-on-surface">
              Mi Espacio de Trabajo
            </h1>
            <p className="font-code-sm text-code-sm text-on-surface-variant">
              {dataCache.length} Proyectos activos.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar diagramas..."
                type="text"
                className="w-full rounded border border-outline-variant bg-surface-container-lowest py-2 pl-9 pr-4 font-code-sm text-code-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary md:w-64 placeholder:text-outline/70"
              />
            </div>
            <button
              className="rounded border border-outline-variant bg-surface-container-lowest p-2 text-on-surface-variant transition-colors hover:bg-surface-variant"
              title="Filtro"
            >
              <Filter className="h-4 w-4" />
            </button>
            <button
              className="rounded border border-outline-variant bg-surface-container-lowest p-2 text-on-surface-variant transition-colors hover:bg-surface-variant"
              title="Vista de cuadrícula"
            >
              <Grid2x2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 p-8 pb-24">
        {/* Mis proyectos */}
        <h2 className="mb-4 flex items-center gap-2 text-headline-md tracking-tight text-on-surface">
          <FolderOpen className="text-xl text-primary" />
          Mis Proyectos
        </h2>

        {dataCache.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded border-2 border-dashed border-outline-variant bg-surface-container-low p-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-variant text-on-surface-variant">
              <FolderOpen className="h-8 w-8" />
            </div>
            <h3 className="font-class-name text-class-name text-on-surface">
              Aún no tienes proyectos
            </h3>
            <p className="mt-2 max-w-sm font-code-sm text-code-sm text-on-surface-variant">
              Crea tu primer proyecto para empezar a diseñar diagramas de
              clases y entidades.
            </p>
          </div>
        ) : mios.length === 0 ? (
          <p className="font-code-sm text-code-sm text-on-surface-variant">
            {query
              ? "No hay proyectos propios que coincidan con la búsqueda."
              : "Aún no has creado ningún proyecto."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {mios.map((p) => (
              <ProjectCard key={p.proyectoId} data={aCard(p)} />
            ))}
          </div>
        )}

        {/* En colaboración */}
        {dataCache.length > 0 && (
          <div className="mt-12 border-t border-outline-variant/30 pt-8">
            <h2 className="mb-4 flex items-center gap-2 text-headline-md tracking-tight text-on-surface">
              <UserRound className="text-xl text-primary" />
              Proyectos en colaboración
            </h2>

            {colaboracion.length === 0 ? (
              <p className="font-code-sm text-code-sm text-on-surface-variant">
                {query
                  ? "No hay colaboraciones que coincidan con la búsqueda."
                  : "Todavía no participas en proyectos de otros."}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {colaboracion.map((p) => (
                  <ProjectCard key={p.proyectoId} data={aCard(p)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {confirmId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-[#2B2A28]/60 backdrop-blur-sm" onClick={() => setConfirmId(null)} />
          <div className="relative z-10 w-full max-w-md rounded border bg-surface-container-lowest p-6 shadow-xl">
            <h3 className="font-class-name text-class-name text-on-surface">
              ¿Eliminar “{dataCache.find((p) => p.proyectoId === confirmId)?.nombre}”?
            </h3>
            <p className="mt-2 font-code-sm text-code-sm text-on-surface-variant">Esta acción es permanente.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setConfirmId(null)} className="rounded border border-outline px-4 py-2 font-code-sm text-code-sm text-on-surface hover:bg-surface-variant">
                Cancelar
              </button>
              <button
                disabled={deletingId !== null}
                onClick={() => handleDelete(confirmId!)}
                className="rounded bg-error px-4 py-2 font-code-sm text-code-sm text-on-error hover:bg-error/90 disabled:opacity-50"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {viewId !== null && (
        <ViewDetailsModal
        open={viewId !== null} 
        onClose={() => setViewId(null)} 
        proyectoId={viewId} 
        rol={dataCache.find(p => p.proyectoId===viewId)?.rol}
        nombreInicial={dataCache.find(p => p.proyectoId===viewId)?.nombre ?? ""}
        onUpdated={(nuevoNombre)=>{
        setDataCache(prev=>prev.map(p=>p.proyectoId===viewId?{...p,nombre:nuevoNombre}:p));
        // construir el nuevo array para el store a partir de dataCache actual (no función)
        const next = dataCache.map(p=> p.proyectoId===viewId ? {proyectoId:p.proyectoId, nombre:nuevoNombre} : {proyectoId:p.proyectoId, nombre:p.nombre});
        setProyectos(next);
        }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 max-w-[92vw] -translate-x-1/2 rounded border px-4 py-2 shadow-lg md:left-[calc(50%+7.5rem)]"
             style={{ backgroundColor: toast.type === "success" ? "#e6f4ea" : "#ffdad6", borderColor: toast.type === "success" ? "#a3d9b1" : "#93000a" }}>
          <p className="font-code-sm text-code-sm" style={{ color: toast.type === "success" ? "#0d5d2e" : "#93000a" }}>
            {toast.msg}
          </p>
        </div>
      )}
      <HelpAssistant />
    </>
  );
}
