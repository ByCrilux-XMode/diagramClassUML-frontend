"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  Plus,
  Save,
  Trash2,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { actualizarProyecto, obtenerProyecto } from "@/lib/proyectos";
import {
  actualizarPermisoColaborador,
  agregarColaborador,
  buscarUsuarioPorUsername,
  eliminarColaborador,
  listarColaboradores,
  listarPermisos,
} from "@/lib/colaboradores";
import type { Colaborador, Permiso, RolProyecto } from "@/types/proyecto";
import { parseEAXml, serializeEAXml } from "@/lib/xmi/ea";
import ExportBackendModal from "../backend/ExportBackendModal";
import type { UmlModelData } from "@/types/uml";

interface ViewDetailsModalProps {
  open: boolean;
  onClose: () => void;
  proyectoId: string | number;
  nombreInicial: string;
  rol?: RolProyecto;
  onUpdated?: (nuevoNombre: string) => void;
}

const OPCIONES_PERMISO_DEFECTO: Permiso[] = [
  { permisoId: 1, nombre: "LECTOR" },
  { permisoId: 2, nombre: "EDITOR" },
];

const FONDOS_AVATAR = [
  "bg-primary-container text-on-primary-container",
  "bg-secondary-container text-on-secondary-container",
  "bg-tertiary-container text-on-tertiary-container",
];

function etiquetaPermiso(permisoId: number): string {
  return permisoId === 2 ? "Editor" : "Visualizador / Lector";
}

export default function ViewDetailsModal({
  open,
  onClose,
  proyectoId,
  nombreInicial,
  rol,
  onUpdated,
}: ViewDetailsModalProps) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esCreador = rol === "CREADOR";
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [pendingPermisos, setPendingPermisos] = useState<Record<number, number>>({});
  const [username, setUsername] = useState("");
  const [permisoNuevo, setPermisoNuevo] = useState(1);
  const [cargandoColab, setCargandoColab] = useState(false);
  const [guardandoPermisos, setGuardandoPermisos] = useState(false);
  const [errorColabs, setErrorColabs] = useState<string | null>(null);
  const [msgColabs, setMsgColabs] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [formatoExport, setFormatoExport] = useState("xml");
  const [formatoImport, setFormatoImport] = useState("xml");
  const [importando, setImportando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [backendOpen, setBackendOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (msg: string, type: "success" | "error") => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ msg, type });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 7000);
  };

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 7000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    if (!errorColabs) return;
    const t = setTimeout(() => setErrorColabs(null), 7000);
    return () => clearTimeout(t);
  }, [errorColabs]);

  useEffect(() => {
    if (!msgColabs) return;
    const t = setTimeout(() => setMsgColabs(null), 7000);
    return () => clearTimeout(t);
  }, [msgColabs]);

  useEffect(() => {
    setNombre(nombreInicial);
  }, [nombreInicial]);

  useEffect(() => {
    if (!open) return;
    setColaboradores([]);
    setPendingPermisos({});
    setUsername("");
    setErrorColabs(null);
    setMsgColabs(null);
    if (!esCreador) return;
    setCargandoColab(true);
    Promise.all([listarColaboradores(proyectoId), listarPermisos()])
      .then(([cols, listaPermisos]) => {
        setColaboradores(cols);
        const editorYLectores = listaPermisos
          .filter((p) => p.nombre === "LECTOR" || p.nombre === "EDITOR")
          .sort((a, b) => a.permisoId - b.permisoId);
        setPermisos(editorYLectores);
        const lector = editorYLectores.find((p) => p.nombre === "LECTOR");
        setPermisoNuevo(lector?.permisoId ?? 1);
      })
      .catch((err: unknown) => {
        const s = (err as { response?: { status?: number } })?.response?.status;
        let m = "Error al cargar colaboradores";
        if (s === 401) m = "Sesión expirada";
        else if (s === 403) m = "Solo el creador gestiona colaboradores";
        else if (s === 404) m = "No existe el proyecto";
        setErrorColabs(m);
        showToast(m, "error");
      })
      .finally(() => setCargandoColab(false));
  }, [open, proyectoId, esCreador]);

  const handleActualizar = async () => {
    const trimmed = nombre.trim();
    if (!trimmed) {
      const m = "campo requerido";
      setError(m);
      showToast(m, "error");
      return;
    }
    if (trimmed.length > 100) {
      const m = "Max 100 letras";
      setError(m);
      showToast(m, "error");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await actualizarProyecto(proyectoId, { nombre: trimmed });
      onUpdated?.(trimmed);
      setError(null);
      showToast("Proyecto actualizado", "success");
    } catch (err: unknown) {
      const s = (err as { response?: { status?: number } })?.response?.status;
      let m = "Error al guardar";
      if (s === 401) m = "Sesión expirada";
      else if (s === 403) m = "Solo CREADOR/EDITOR";
      else if (s === 404) m = "No existe";
      setError(m);
      showToast(m, "error");
    } finally {
      setSaving(false);
    }
  };

  const refrescarColaboradores = async () => {
    const cols = await listarColaboradores(proyectoId);
    setColaboradores(cols);
  };

  const handleAnadir = async () => {
    const u = username.trim();
    if (!u) {
      const m = "Escribe un nombre de usuario";
      setErrorColabs(m);
      showToast(m, "error");
      return;
    }
    setErrorColabs(null);
    setMsgColabs(null);
    try {
      const usuario = await buscarUsuarioPorUsername(u);
      await agregarColaborador(proyectoId, {
        usuarioId: usuario.usuarioId,
        permisoId: permisoNuevo,
      });
      setUsername("");
      setPendingPermisos((prev) => {
        const next = { ...prev };
        delete next[usuario.usuarioId];
        return next;
      });
      await refrescarColaboradores();
      const m = "Colaborador añadido";
      setMsgColabs(m);
      showToast(m, "success");
    } catch (err: unknown) {
      const s = (err as { response?: { status?: number } })?.response?.status;
      let m = "Error al añadir colaborador";
      if (s === 401) m = "Sesión expirada";
      else if (s === 403) m = "Solo el creador gestiona colaboradores";
      else if (s === 404) m = "Usuario no encontrado";
      setErrorColabs(m);
      showToast(m, "error");
    }
  };

  const handleCambiarPermiso = (usuarioId: number, permisoId: number) => {
    setColaboradores((prev) =>
      prev.map((c) => (c.usuarioId === usuarioId ? { ...c, permisoId } : c))
    );
    setPendingPermisos((prev) => ({ ...prev, [usuarioId]: permisoId }));
  };

  const handleEliminar = async (usuarioId: number) => {
    setErrorColabs(null);
    setMsgColabs(null);
    try {
      await eliminarColaborador(proyectoId, usuarioId);
      setColaboradores((prev) => prev.filter((c) => c.usuarioId !== usuarioId));
      setPendingPermisos((prev) => {
        const next = { ...prev };
        delete next[usuarioId];
        return next;
      });
      const m = "Colaborador eliminado";
      setMsgColabs(m);
      showToast(m, "success");
    } catch (err: unknown) {
      const s = (err as { response?: { status?: number } })?.response?.status;
      let m = "Error al eliminar colaborador";
      if (s === 401) m = "Sesión expirada";
      else if (s === 403) m = "Solo el creador gestiona colaboradores";
      else if (s === 404) m = "Ya no existe";
      setErrorColabs(m);
      showToast(m, "error");
    }
  };

  const cantidadPendientes = Object.keys(pendingPermisos).length;

  const handleGuardarPermisos = async () => {
    if (cantidadPendientes === 0) {
      showToast("Sin cambios pendientes", "error");
      return;
    }
    setGuardandoPermisos(true);
    setErrorColabs(null);
    setMsgColabs(null);
    try {
      await Promise.all(
        Object.entries(pendingPermisos).map(([usuarioId, permisoId]) =>
          actualizarPermisoColaborador(proyectoId, Number(usuarioId), permisoId)
        )
      );
      setPendingPermisos({});
      await refrescarColaboradores();
      const m = "Permisos guardados";
      setMsgColabs(m);
      showToast(m, "success");
    } catch (err: unknown) {
      const s = (err as { response?: { status?: number } })?.response?.status;
      let m = "Error al guardar permisos";
      if (s === 401) m = "Sesión expirada";
      else if (s === 403) m = "Solo el creador gestiona colaboradores";
      setErrorColabs(m);
      showToast(m, "error");
    } finally {
      setGuardandoPermisos(false);
    }
  };

  const iniciales = (c: Colaborador): string => {
    const n = c.usuario.persona.nombre?.charAt(0) ?? "";
    const a = c.usuario.persona.apellido?.charAt(0) ?? "";
    return `${n}${a}`.toUpperCase() || c.usuario.username.slice(0, 2).toUpperCase();
  };

  const esquemaToModel = (esquema: Record<string, unknown> | null): UmlModelData => {
    if (!esquema) return { nodes: [], links: [] };
    const raw = esquema as Record<string, unknown>;
    if (Array.isArray(raw["nodeDataArray"]) || Array.isArray(raw["linkDataArray"])) {
      return {
        nodes: (raw["nodeDataArray"] as unknown as UmlModelData["nodes"]) ?? [],
        links: (raw["linkDataArray"] as unknown as UmlModelData["links"]) ?? [],
      };
    }
    if (Array.isArray(raw["nodes"]) || Array.isArray(raw["links"])) {
      return {
        nodes: (raw["nodes"] as UmlModelData["nodes"]) ?? [],
        links: (raw["links"] as UmlModelData["links"]) ?? [],
      };
    }
    return { nodes: [], links: [] };
  };

  const modelToGraphLinksJson = (model: UmlModelData): Record<string, unknown> => ({
    class: "GraphLinksModel",
    nodeKeyProperty: "key",
    linkCategoryProperty: "category",
    nodeDataArray: model.nodes as unknown as Record<string, unknown>[],
    linkDataArray: model.links as unknown as Record<string, unknown>[],
  });
  //metodo para exportar
  const handleExport = async () => {
    setExportando(true);
    try {
      const proyecto = await obtenerProyecto(proyectoId);
      const esquema = (proyecto.esquemaJson ?? null) as Record<string, unknown> | null;
      if (formatoExport === "json") {
        const jsonStr = JSON.stringify(esquema ?? { class: "GraphLinksModel", nodeDataArray: [], linkDataArray: [] }, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${proyecto.nombre.replace(/\s+/g, "_")}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Proyecto exportado (JSON)", "success");
      } else {
        // xml / ae -> XMI EA usando el archivo de C:\Users\PC\Desktop\exportadoDeAE como plantilla base
        const model = esquemaToModel(esquema);
        const xml = serializeEAXml(model, { packageName: proyecto.nombre });
        const blob = new Blob([xml], { type: "application/xml;charset=windows-1252" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${proyecto.nombre.replace(/\s+/g, "_")}.xml`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Proyecto exportado (XML EA)", "success");
      }
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Error al exportar";
      showToast(m, "error");
      setErrorColabs(m);
    } finally {
      setExportando(false);
    }
  };

  const handleImportFile = async (file: File) => {
    setImportando(true);
    setErrorColabs(null);
    setMsgColabs(null);
    try {
      const buf = await file.arrayBuffer();
      let text: string;
      if (formatoImport === "json") {
        text = new TextDecoder("utf-8").decode(buf);
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(text) as Record<string, unknown>;
        } catch {
          throw new Error("JSON inválido");
        }
        // Normalizar a GraphLinksModel
        let graphJson: Record<string, unknown>;
        if (parsed["class"] === "GraphLinksModel") graphJson = parsed;
        else if (Array.isArray(parsed["nodes"]) || Array.isArray(parsed["nodeDataArray"])) {
          const m = esquemaToModel(parsed);
          graphJson = modelToGraphLinksJson(m);
        } else {
          throw new Error("JSON no contiene un diagrama válido");
        }
        await actualizarProyecto(proyectoId, { esquemaJson: graphJson });
        showToast("Proyecto importado (JSON) — diagrama reemplazado", "success");
        setMsgColabs("Proyecto importado — recarga el editor para verlo");
      } else {
        // xml -> windows-1252 como en exportadoDeAE
        try {
          text = new TextDecoder("windows-1252").decode(buf);
        } catch {
          text = new TextDecoder("utf-8").decode(buf);
        }
        if (!text.includes("<xmi:XMI") && !text.includes("<uml:Model")) {
          throw new Error("XML no es un XMI EA válido");
        }
        const model = parseEAXml(text);
        const graphJson = modelToGraphLinksJson(model);
        await actualizarProyecto(proyectoId, { esquemaJson: graphJson });
        showToast(`Proyecto importado (XML): ${model.nodes.length} clases, ${model.links.length} relaciones — diagrama reemplazado`, "success");
        setMsgColabs("Proyecto importado — recarga el editor para verlo");
      }
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : "Error al importar";
      showToast(m, "error");
      setErrorColabs(m);
    } finally {
      setImportando(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const opcionesPermiso =
    permisos.length > 0 ? permisos : OPCIONES_PERMISO_DEFECTO;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4">
      <div
        className="absolute inset-0 bg-[#2B2A28]/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[85vh] max-h-[85dvh] w-full max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded border border-outline-variant bg-surface shadow-[4px_4px_0px_0px_rgba(28,27,26,0.12)] animate-modal-in sm:max-w-lg lg:max-w-xl xl:max-w-2xl">
        <div className="flex items-center justify-between border-b border-outline-variant/40 bg-surface-container-low px-6 py-4">
          <div>
            <h2 className="font-headline-md text-headline-md font-bold text-on-surface">
              Detalles del Proyecto
            </h2>
            <p className="mt-1 font-code-sm text-code-sm text-on-surface-variant">
              Configuración{rol ? ` · ${rol}` : ""}
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

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-6">
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2 border-b border-outline-variant/30 pb-1">
              <h3 className="font-class-name text-[12px] font-bold uppercase tracking-wider text-on-surface">
                Datos principales
              </h3>
            </div>
            <div className="flex flex-col items-end gap-3 sm:flex-row">
              <div className="w-full flex-1">
                <label className="mb-1 block font-code-sm text-code-sm text-on-surface-variant">
                  Nombre del proyecto
                </label>
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre del proyecto"
                  className="w-full rounded border border-outline-variant bg-surface-container-lowest px-3 py-2 font-body-md text-body-md text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {error && <p className="mt-1 font-code-sm text-code-sm text-error">{error}</p>}
              </div>
              <button
                onClick={handleActualizar}
                disabled={saving}
                className="flex shrink-0 items-center gap-1.5 rounded bg-primary px-4 py-2 font-class-name text-class-name text-on-primary shadow-sm transition-all hover:bg-on-primary-fixed-variant disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                Guardar
              </button>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2 border-b border-outline-variant/30 pb-1">
              <h3 className="font-class-name text-[12px] font-bold uppercase tracking-wider text-on-surface">
                Proyecto
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col justify-between gap-3 rounded border border-outline-variant/40 bg-surface-container-low p-3.5">
                <div>
                  <span className="mb-1 block font-class-name text-class-name text-on-surface">
                    Exportar proyecto
                  </span>
                  <p className="font-code-sm text-[12px] text-on-surface-variant">
                    Descarga la estructura arquitectónica del diagrama.
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <select
                    value={formatoExport}
                    onChange={(e) => setFormatoExport(e.target.value)}
                    className="flex-1 rounded border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 font-code-sm text-code-sm text-on-surface focus:border-primary focus:outline-none"
                  >
                    <option value="json">JSON</option>
                    <option value="xml">XML (EA)</option>
                  </select>
                  <button
                    onClick={handleExport}
                    disabled={exportando}
                    className="flex items-center gap-1 rounded border border-outline-variant bg-surface-container-lowest px-3 py-1.5 font-class-name text-[13px] text-on-surface transition-colors hover:border-primary hover:bg-surface-variant disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    Exportar
                  </button>
                </div>
              </div>
              <div className="flex flex-col justify-between gap-3 rounded border border-outline-variant/40 bg-surface-container-low p-3.5">
                <div>
                  <span className="mb-1 block font-class-name text-class-name text-on-surface">
                    Importar proyecto
                  </span>
                  <p className="font-code-sm text-[12px] text-on-surface-variant">
                    Sube un archivo compatible para sincronizar modelos.
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <select
                    value={formatoImport}
                    onChange={(e) => setFormatoImport(e.target.value)}
                    className="flex-1 rounded border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 font-code-sm text-code-sm text-on-surface focus:border-primary focus:outline-none"
                  >
                    <option value="json">JSON</option>
                    <option value="xml">XML (EA)</option>
                  </select>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".json,.xml,.xmi"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportFile(file);
                    }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importando}
                    className="flex items-center gap-1 rounded border border-outline-variant bg-surface-container-lowest px-3 py-1.5 font-class-name text-[13px] text-on-surface transition-colors hover:border-primary hover:bg-surface-variant disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    Importar
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2 border-b border-outline-variant/30 pb-1">
              <h3 className="font-class-name text-[12px] font-bold uppercase tracking-wider text-on-surface">
                Backend Spring Boot
              </h3>
            </div>
            <div className="flex flex-col justify-between gap-3 rounded border border-outline-variant/40 bg-surface-container-low p-3.5">
              <div>
                <span className="mb-1 block font-class-name text-class-name text-on-surface">
                  Generar proyecto ejecutable
                </span>
                <p className="font-code-sm text-[12px] text-on-surface-variant">
                  Produce un ZIP con Spring Boot 3 + H2 y colección Postman, desde el
                  último diagrama guardado.
                </p>
              </div>
              <div className="pt-2">
                <button
                  onClick={() => setBackendOpen(true)}
                  className="flex items-center gap-1 rounded border border-outline-variant bg-surface-container-lowest px-3 py-1.5 font-class-name text-[13px] text-on-surface transition-colors hover:border-primary hover:bg-surface-variant"
                >
                  <Download className="h-4 w-4" />
                  Exportar Backend Spring Boot
                </button>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-outline-variant/30 pb-1">
              <div className="flex items-center gap-2">
                <h3 className="font-class-name text-[12px] font-bold uppercase tracking-wider text-on-surface">
                  Colaboradores
                </h3>
              </div>
              <span className="font-code-sm text-code-sm text-on-surface-variant">
                {colaboradores.length} miembros
              </span>
            </div>

            {!esCreador ? (
              <p className="font-code-sm text-code-sm text-on-surface-variant">
                Solo el creador puede gestionar colaboradores.
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                  <div className="relative min-w-[180px] flex-1">
                    <UserPlus className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" />
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAnadir();
                      }}
                      placeholder="Nombre de usuario"
                      className="w-full rounded border border-outline-variant bg-surface-container-lowest py-2 pl-9 pr-3 font-body-md text-body-md text-on-surface transition-all placeholder:text-outline/70 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div className="flex w-full gap-2 sm:w-auto sm:shrink-0">
                    <select
                      value={permisoNuevo}
                      onChange={(e) => setPermisoNuevo(Number(e.target.value))}
                      className="min-w-0 flex-1 rounded border border-outline-variant bg-surface-container-lowest px-2.5 py-2 font-code-sm text-code-sm text-on-surface focus:border-primary focus:outline-none sm:flex-none"
                      title="Permiso del colaborador"
                    >
                      {opcionesPermiso.map((p) => (
                        <option key={p.permisoId} value={p.permisoId}>
                          {etiquetaPermiso(p.permisoId)}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleAnadir}
                      className="flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded bg-secondary-container px-3.5 py-2 font-class-name text-class-name text-on-secondary-container transition-all hover:opacity-90"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      <span className="hidden sm:inline">Añadir colaborador</span>
                      <span className="sm:hidden">Añadir</span>
                    </button>
                  </div>
                </div>

                {cargandoColab ? (
                  <p className="font-code-sm text-code-sm text-on-surface-variant">Cargando...</p>
                ) : colaboradores.length === 0 ? (
                  <p className="font-code-sm text-code-sm text-on-surface-variant">
                    Sin colaboradores todavía.
                  </p>
                ) : (
                  <div className="flex flex-col divide-y divide-outline-variant/30 rounded border border-outline-variant/40 bg-surface-container-lowest">
                    {colaboradores.map((colab, i) => (
                      <div key={colab.usuarioId} className="flex items-center justify-between gap-3 p-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-class-name text-[11px] font-bold ${FONDOS_AVATAR[i % FONDOS_AVATAR.length]}`}
                          >
                            {iniciales(colab)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-class-name text-class-name leading-snug text-on-surface">
                              {colab.usuario.username}
                            </p>
                            <span className="truncate font-code-sm text-[11px] text-on-surface-variant">
                              {colab.usuario.persona.nombre} {colab.usuario.persona.apellido}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <select
                            value={colab.permisoId}
                            onChange={(e) =>
                              handleCambiarPermiso(colab.usuarioId, Number(e.target.value))
                            }
                            className="rounded border border-outline-variant bg-surface-container-low px-2.5 py-1 font-code-sm text-code-sm text-on-surface focus:border-primary focus:outline-none"
                          >
                            {opcionesPermiso.map((p) => (
                              <option key={p.permisoId} value={p.permisoId}>
                                {etiquetaPermiso(p.permisoId)}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleEliminar(colab.usuarioId)}
                            className="rounded p-1.5 text-outline transition-colors hover:bg-surface-variant hover:text-error"
                            title="Eliminar colaborador"
                          >
                            <Trash2 className="h-[18px] w-[18px]" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {errorColabs && (
                  <p className="font-code-sm text-code-sm text-error">{errorColabs}</p>
                )}
                {msgColabs && (
                  <p className="font-code-sm text-code-sm" style={{ color: "#0d5d2e" }}>
                    {msgColabs}
                  </p>
                )}
              </>
            )}
          </section>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-outline-variant/40 bg-surface-container-low px-6 py-4">
          <button
            onClick={onClose}
            className="rounded border border-outline-variant px-4 py-2 font-class-name text-class-name text-on-surface transition-colors hover:bg-surface-variant"
          >
            Cerrar
          </button>
          <button
            onClick={handleGuardarPermisos}
            disabled={cantidadPendientes === 0 || guardandoPermisos}
            className="flex items-center gap-1.5 rounded bg-primary px-5 py-2 font-class-name text-class-name text-on-primary shadow-sm transition-colors hover:bg-on-primary-fixed-variant disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Guardar cambios
          </button>
        </div>
      </div>
      <ExportBackendModal
        open={backendOpen}
        onClose={() => setBackendOpen(false)}
        proyectoId={proyectoId}
        nombreProyecto={nombre.trim() || nombreInicial}
      />
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`pointer-events-none fixed bottom-6 left-1/2 z-[80] flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded border px-4 py-3 shadow-lg ${
            toast.type === "success"
              ? "border-[#a3d9b1] bg-[#e6f4ea] text-[#0d5d2e]"
              : "border-[#93000a] bg-[#ffdad6] text-[#93000a]"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <p className="font-code-sm text-code-sm">{toast.msg}</p>
        </div>
      )}
    </div>
  );
}