"use client";

import { useRef, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  FileImage,
  Info,
  Loader2,
  Palette,
  PencilRuler,
  Sparkles,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Image as ImageIcon,
} from "lucide-react";
import * as go from "gojs";
import { crearProyecto } from "@/lib/proyectos";
import type { Proyecto } from "@/types/proyecto";
import { parseEAXml } from "@/lib/xmi/ea";
import type { UmlModelData } from "@/types/uml";
import { runAgentLoop } from "@/lib/ia/agentLoop";
import { runVisionImport, VISION_DEFAULT_MODEL } from "@/lib/ia/visionAgentLoop";
import { SYSTEM_PROMPT } from "@/lib/ia/prompt";
import {
  IA_DEFAULT_MODEL,
  IA_DEFAULT_PROVIDER,
  IA_VISION_PROVIDER,
  OPENROUTER_DEFAULT_MODEL,
} from "@/lib/ia/config";
import { registerDiagram, unregisterDiagram } from "@/lib/editorTools";

interface CreateProjectModalProps {
  open: boolean;
  isExiting?: boolean;
  onClose: () => void;
  onCreated?: (proyecto: Proyecto) => void;
}

function esquemaToModel(esquema: Record<string, unknown> | null): UmlModelData {
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
}

function modelToGraphLinksJson(model: UmlModelData): Record<string, unknown> {
  return {
    class: "GraphLinksModel",
    nodeKeyProperty: "key",
    linkCategoryProperty: "category",
    nodeDataArray: model.nodes as unknown as Record<string, unknown>[],
    linkDataArray: model.links as unknown as Record<string, unknown>[],
  };
}

export default function CreateProjectModal({
  open,
  isExiting = false,
  onClose,
  onCreated,
}: CreateProjectModalProps) {
  const [mode, setMode] = useState<"blank" | "import" | "ai">("blank");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Import state
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importedModel, setImportedModel] = useState<Record<string, unknown> | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [formatoImport, setFormatoImport] = useState<"json" | "xml">("json");
  const importInputRef = useRef<HTMLInputElement>(null);

  // AI state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiImageBase64, setAiImageBase64] = useState<string | null>(null);
  const [aiImagePreview, setAiImagePreview] = useState<string | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGeneratedModel, setAiGeneratedModel] = useState<Record<string, unknown> | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiTrace, setAiTrace] = useState<string | null>(null);
  const aiImageInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = async (file: File) => {
    setImporting(true);
    setImportError(null);
    setImportFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      let graphJson: Record<string, unknown>;
      if (formatoImport === "json") {
        const text = new TextDecoder("utf-8").decode(buf);
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(text) as Record<string, unknown>;
        } catch {
          throw new Error("JSON inválido");
        }
        if (parsed["class"] === "GraphLinksModel") graphJson = parsed;
        else if (Array.isArray(parsed["nodes"]) || Array.isArray(parsed["nodeDataArray"])) {
          const m = esquemaToModel(parsed);
          graphJson = modelToGraphLinksJson(m);
        } else {
          throw new Error("JSON no contiene un diagrama válido");
        }
      } else {
        let text: string;
        try {
          text = new TextDecoder("windows-1252").decode(buf);
        } catch {
          text = new TextDecoder("utf-8").decode(buf);
        }
        if (!text.includes("<xmi:XMI") && !text.includes("<uml:Model")) {
          throw new Error("XML no es un XMI EA válido");
        }
        const model = parseEAXml(text);
        graphJson = modelToGraphLinksJson(model);
      }
      setImportedModel(graphJson);
      setMode("import");
      setImportError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al importar";
      setImportError(msg);
      setImportedModel(null);
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const compressImageToBase64 = (file: File): Promise<{ dataUrl: string; base64: string }> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const maxDim = 1024;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("No se pudo comprimir la imagen"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
        URL.revokeObjectURL(url);
        resolve({ dataUrl, base64 });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo leer la imagen"));
      };
      img.src = url;
    });

  const handleAIImageSelect = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setAiError("Solo se permiten imágenes");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setAiError("Imagen muy grande (máx 8MB)");
      return;
    }
    try {
      const { dataUrl, base64 } = await compressImageToBase64(file);
      setAiImagePreview(dataUrl);
      setAiImageBase64(base64);
      setAiError(null);
      setMode("ai");
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : "No se pudo leer la imagen");
    } finally {
      if (aiImageInputRef.current) aiImageInputRef.current.value = "";
    }
  };

  const handleRemoveAIImage = () => {
    setAiImageBase64(null);
    setAiImagePreview(null);
  };

  const handleSintetizar = async () => {
    const trimmed = aiPrompt.trim();
    if (!trimmed && !aiImageBase64) {
      setAiError("Escribe un prompt o adjunta una foto del boceto");
      return;
    }
    if (!name.trim()) {
      setError("El nombre del proyecto es obligatorio para sintetizar.");
      return;
    }
    setAiGenerating(true);
    setAiError(null);
    setAiTrace(null);
    setAiGeneratedModel(null);

    const tempDiv = document.createElement("div");
    const tempDiagram = new go.Diagram(tempDiv, {
      "undoManager.isEnabled": true,
    });
    tempDiagram.model = new go.GraphLinksModel({
      nodeKeyProperty: "key",
      linkKeyProperty: "key",
      linkCategoryProperty: "category",
      nodeDataArray: [],
      linkDataArray: [],
    });
    registerDiagram(tempDiagram);
    try {
      // RUTA VISIÓN (determinística): si hay foto, NO pasa por runAgentLoop.
      // Una sola llamada al modelo de visión (diagrams2sql) → JSON neutral →
      // mapper determinístico → executeTool. Cero rondas, cero tools inventados.
      // Solo texto → ruta normal qwen-uml con function-calling.
      const userMsg = trimmed || "Genera el diagrama a partir de la imagen adjunta del boceto en papel/pizarra";
      let result;
      try {
        result = aiImageBase64
          ? await runVisionImport({
              provider: IA_VISION_PROVIDER,
              model: VISION_DEFAULT_MODEL,
              images: [aiImageBase64],
              userMessage: trimmed || undefined,
            })
          : await runAgentLoop({
              provider: IA_DEFAULT_PROVIDER,
              model: IA_DEFAULT_MODEL || "qwen2.5-coder:7b",
              systemPrompt: SYSTEM_PROMPT,
              userMessage: userMsg,
              hitl: false,
            });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTunelError =
          /fetch failed|timeout|aborted|ECONNREFUSED|502|tunel|ollama/i.test(msg) ||
          IA_DEFAULT_PROVIDER === "ollama" ||
          IA_DEFAULT_PROVIDER === "hf-space";
        if (!isTunelError) throw err;
        // Fallback a OpenRouter con cualquiera de las keys de .env (OPENROUTER_API_KEY* con rotación)
        setAiTrace("Túnel no responde, reintentando con respaldo OpenRouter...");
        result = aiImageBase64
          ? await runVisionImport({
              provider: "openrouter" as const,
              model: OPENROUTER_DEFAULT_MODEL,
              images: [aiImageBase64],
              userMessage: trimmed || undefined,
            })
          : await runAgentLoop({
              provider: "openrouter" as const,
              model: OPENROUTER_DEFAULT_MODEL,
              systemPrompt: SYSTEM_PROMPT,
              userMessage: userMsg,
              hitl: false,
            });
      }
      const hasTrace = result.trace && result.trace.length > 0;
      if (!hasTrace) {
        throw new Error(
          result.finalContent ||
            (aiImageBase64
              ? "La visión no generó cambios. Revisá que la foto tenga el diagrama bien iluminado y completo."
              : "El modelo no generó cambios. Reformula el prompt o prueba con qwen2.5-coder:7b")
        );
      }
      const jsonStr = tempDiagram.model.toJson();
      const graphJson = JSON.parse(jsonStr) as Record<string, unknown>;
      const nodes = (graphJson["nodeDataArray"] as unknown[])?.length ?? 0;
      const links = (graphJson["linkDataArray"] as unknown[])?.length ?? 0;
      if (nodes === 0) throw new Error("El modelo no creó clases. Intenta ser más explícito: ej. 'Crea clases Cliente, Producto...'");
      setAiGeneratedModel(graphJson);
      setAiTrace(`${nodes} clases, ${links} relaciones — ${result.finalContent.slice(0, 200)}`);
      setMode("ai");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiError(msg);
    } finally {
      unregisterDiagram();
      tempDiagram.div = null;
      setAiGenerating(false);
    }
  };

  const crear = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("El nombre del proyecto es obligatorio.");
      return;
    }
    let esquemaJson: Record<string, unknown> | null = null;
    if (mode === "blank") {
      esquemaJson = { class: "GraphLinksModel", nodeKeyProperty: "key", linkKeyProperty: "key", linkCategoryProperty: "category", nodeDataArray: [], linkDataArray: [] };
    } else if (mode === "import") {
      if (!importedModel) {
        setImportError("Selecciona un archivo JSON o XML válido antes de crear");
        return;
      }
      esquemaJson = importedModel;
    } else if (mode === "ai") {
      if (!aiGeneratedModel) {
        // Si aún no sintetizó, intenta sintetizar ahora
        if (!aiPrompt.trim() && !aiImageBase64) {
          setAiError("Escribe un prompt o adjunta una foto y pulsa Sintetizar");
          return;
        }
        await handleSintetizar();
        // Si falló, no crear
        return;
      }
      esquemaJson = aiGeneratedModel;
    }

    setCreating(true);
    setError(null);
    try {
      const proyecto = await crearProyecto({ nombre: trimmed, esquemaJson });
      onCreated?.(proyecto);
    } catch {
      setError("No se pudo crear el proyecto. Inténtalo de nuevo.");
      setCreating(false);
    }
  };

  if (!open) return null;

  const importPreview = importedModel
    ? (() => {
        const m = esquemaToModel(importedModel);
        return `${m.nodes.length} clases, ${m.links.length} relaciones`;
      })()
    : null;

  const aiPreview = aiGeneratedModel
    ? (() => {
        const m = esquemaToModel(aiGeneratedModel);
        return `${m.nodes.length} clases, ${m.links.length} relaciones`;
      })()
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className={`absolute inset-0 bg-[#2B2A28] ${isExiting ? "animate-fade-out" : "animate-fade-in"}`}
        onClick={onClose}
      />

      <div
        className={`relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded border border-outline bg-surface-container-lowest shadow-[4px_4px_0px_0px_rgba(28,27,26,0.12)] ${
          isExiting ? "animate-modal-out" : "animate-modal-in"
        }`}
      >
        <div className="flex items-start justify-between border-b border-outline-variant bg-surface-container px-6 py-5">
          <div className="flex items-start gap-3.5">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded border border-outline bg-surface-container-highest text-primary">
              <PencilRuler className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-headline-lg font-semibold tracking-tight text-on-surface">Nuevo Proyecto</h1>
              </div>
              <p className="mt-0.5 text-body-md text-on-surface-variant">
                Inicializar Proyecto de Arquitectura · Configure las bases del sistema o sintetice modelos a partir de especificaciones
                formales.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-on-surface"
            aria-label="Cerrar modal"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto bg-surface p-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="project-name" className="flex items-center gap-1.5 font-class-name text-class-name text-on-surface">
                <span>Nombre del proyecto</span>
                <span className="font-bold text-secondary">*</span>
              </label>
              <span className="font-code-sm text-code-sm text-outline">IDENTIFICADOR_CANÓNICO</span>
            </div>
            <div className="relative">
              <input
                id="project-name"
                name="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej. Core Banking Microservice, Sistema de Gestión de Inventario"
                className="w-full rounded-t border-0 border-b border-outline bg-surface-container-lowest px-3 py-2.5 text-sm font-class-name text-class-name text-on-surface transition-colors placeholder:font-normal placeholder:text-outline focus:border-primary focus:ring-0"
              />
              <span className="absolute right-3 top-2.5 font-code-sm text-code-sm text-outline">UTF-8</span>
            </div>
            {error && <p className="font-code-sm text-code-sm text-error">{error}</p>}
          </div>

          <label className="flex cursor-pointer items-center justify-between rounded bg-surface-container-low p-3.5 shadow-sm transition-colors group border-2 border-primary">
            <div className="flex items-center gap-3.5">
              <div className="flex h-9 w-9 items-center justify-center rounded border border-primary bg-primary-fixed/30 text-primary">
                <Palette className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-class-name text-class-name font-semibold text-on-surface">Empezar diagrama en blanco</span>
                  <span className="rounded bg-primary-fixed/30 px-1.5 py-0.5 font-badge-label text-badge-label font-bold uppercase text-primary">Recomendado</span>
                </div>
                <p className="mt-0.5 font-code-sm text-code-sm text-outline">Lienzo vacío listo para diseñar clases, entidades y relaciones desde cero.</p>
              </div>
            </div>
            <input
              type="radio"
              name="project-init-mode"
              checked={mode === "blank"}
              onChange={() => setMode("blank")}
              className="h-4 w-4 cursor-pointer border-outline text-primary focus:ring-0"
            />
          </label>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-12">
            <div className="flex flex-col space-y-2 md:col-span-4">
              <div className="flex items-center justify-between">
                <span className="font-class-name text-class-name text-on-surface">Importar diagrama</span>
                <span className="font-badge-label text-badge-label uppercase text-outline">Opcional</span>
              </div>
              <div
                onClick={() => {
                  setMode("import");
                  importInputRef.current?.click();
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) {
                    const ext = file.name.split(".").pop()?.toLowerCase();
                    if (ext === "json") setFormatoImport("json");
                    else if (ext === "xml" || ext === "xmi") setFormatoImport("xml");
                    handleImportFile(file);
                  }
                }}
                className={`flex min-h-[170px] flex-1 cursor-pointer flex-col items-center justify-center rounded border-2 border-dashed p-4 text-center transition-all group ${
                  mode === "import" ? "border-primary bg-surface-container-low" : "border-outline-variant bg-surface-container-low hover:border-primary hover:bg-surface"
                }`}
              >
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,.xml,.xmi"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const ext = file.name.split(".").pop()?.toLowerCase();
                      if (ext === "json") setFormatoImport("json");
                      else if (ext === "xml" || ext === "xmi") setFormatoImport("xml");
                      handleImportFile(file);
                    }
                  }}
                />
                <div className="mb-2.5 flex h-10 w-10 items-center justify-center rounded border border-outline-variant bg-surface-container-highest text-outline transition-colors group-hover:text-primary">
                  {importing ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
                </div>
                <span className="block font-class-name text-class-name leading-snug text-on-surface">
                  {importFileName ? importFileName : "Arrastrar y soltar archivo"}
                </span>
                <span className="mt-1 block font-code-sm text-code-sm text-outline">
                  {importPreview ? importPreview : "Importar archivos de diagrama compatibles"}
                </span>
                {importedModel && (
                  <span className="mt-2 flex items-center gap-1 font-code-sm text-code-sm text-green-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Listo para crear
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={formatoImport}
                  onChange={(e) => setFormatoImport(e.target.value as "json" | "xml")}
                  className="flex-1 rounded border border-outline-variant bg-surface-container-lowest px-2 py-1.5 font-code-sm text-code-sm text-on-surface"
                  title="Formato"
                >
                  <option value="json">JSON</option>
                  <option value="xml">XML (EA)</option>
                </select>
                {importedModel && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setImportedModel(null);
                      setImportFileName(null);
                      setImportError(null);
                    }}
                    className="rounded p-1.5 text-outline hover:bg-surface-variant hover:text-error"
                    title="Quitar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              {importError && <p className="flex items-center gap-1 font-code-sm text-code-sm text-error"><AlertCircle className="h-3.5 w-3.5" />{importError}</p>}
              {importFileName && !importError && mode === "import" && (
                <label className="flex cursor-pointer items-center gap-2 font-code-sm text-code-sm text-primary">
                  <input type="radio" checked={mode === "import"} onChange={() => setMode("import")} className="h-3.5 w-3.5" /> Usar este archivo al crear
                </label>
              )}
            </div>

            <div className="flex flex-col space-y-2 md:col-span-8">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-class-name text-class-name text-on-surface">Generar con Asistente IA</span>
                {aiGeneratedModel && (
                  <span className="ml-auto flex items-center gap-1 rounded bg-green-50 px-2 py-0.5 font-code-sm text-code-sm text-green-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {aiPreview}
                  </span>
                )}
              </div>
              <div className={`flex flex-col gap-2.5 rounded border bg-surface-container-lowest p-3 transition-colors ${mode === "ai" ? "border-primary" : "border-outline-variant focus-within:border-primary"}`}>
                <textarea
                  rows={3}
                  value={aiPrompt}
                  onChange={(e) => {
                    setAiPrompt(e.target.value);
                    if (e.target.value.trim()) setMode("ai");
                  }}
                  onClick={() => setMode("ai")}
                  placeholder="Describe tu sistema o clases de forma sencilla (ej. Un sistema de biblioteca con Libros, Usuarios y Préstamos)..."
                  className="w-full resize-none border-none bg-transparent p-1 font-body-md text-body-md text-on-surface placeholder:text-outline focus:ring-0"
                />
                {aiImagePreview && (
                  <div className="relative flex items-center gap-3 rounded border border-outline-variant bg-surface p-2">
                    <img src={aiImagePreview} alt="Boceto" className="h-16 w-16 rounded object-cover" />
                    <div className="min-w-0 flex-1">
                    <p className="truncate font-code-sm text-code-sm text-on-surface">Boceto adjunto (visión {VISION_DEFAULT_MODEL})</p>
                    <p className="font-code-sm text-code-sm text-outline">Se enviará al modelo de visión para extraer el esquema</p>
                    </div>
                    <button onClick={handleRemoveAIImage} className="rounded p-1 text-outline hover:bg-surface-variant hover:text-error" title="Quitar imagen">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {aiGeneratedModel && (
                  <div className="rounded border border-green-200 bg-green-50 p-2.5">
                    <p className="flex items-center gap-1.5 font-code-sm text-code-sm font-semibold text-green-800">
                      <CheckCircle2 className="h-4 w-4" /> Diagrama sintetizado — {aiPreview}
                    </p>
                    {aiTrace && <p className="mt-1 line-clamp-2 font-code-sm text-code-sm text-green-700">{aiTrace}</p>}
                  </div>
                )}
                {aiError && <p className="flex items-center gap-1 font-code-sm text-code-sm text-error"><AlertCircle className="h-3.5 w-3.5" />{aiError}</p>}
                <div className="mt-1 flex items-center justify-between border-t border-outline-variant pt-2.5">
                  <div className="flex items-center gap-1.5">
                   {/*
                   <button
                      onClick={() => {
                        // voz: placeholder
                        setMode("ai");
                      }}
                      className="flex items-center gap-1.5 rounded border border-outline-variant px-2.5 py-1 font-code-sm text-code-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                      title="Próximamente"
                    >
                      <AudioLines className="h-4 w-4 text-secondary" />
                      <span className="hidden sm:inline">Grabar voz</span>
                    </button>*/}
                    <input ref={aiImageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAIImageSelect(f); }} />
                    <button
                      onClick={() => aiImageInputRef.current?.click()}
                      className="flex items-center gap-1.5 rounded border border-outline-variant px-2.5 py-1 font-code-sm text-code-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                    >
                      <FileImage className="h-4 w-4" />
                      <span className="hidden sm:inline">{aiImagePreview ? "Cambiar boceto" : "Adjuntar boceto"}</span>
                    </button>
                    {aiImagePreview && <span className="hidden items-center gap-1 font-code-sm text-code-sm text-primary sm:flex"><ImageIcon className="h-3.5 w-3.5" /> visión</span>}
                  </div>
                  <button
                    onClick={handleSintetizar}
                    disabled={aiGenerating || (!aiPrompt.trim() && !aiImageBase64)}
                    className="flex items-center gap-1.5 rounded border border-primary bg-primary-fixed/30 px-3 py-1 font-code-sm text-code-sm font-semibold text-primary transition-all active:scale-95 hover:bg-primary-fixed/60 disabled:opacity-40"
                  >
                    {aiGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    <span>{aiGenerating ? "Sintetizando..." : aiGeneratedModel ? "Re-sintetizar" : "Sintetizar"}</span>
                  </button>
                </div>
              </div>
              {!aiGeneratedModel && mode === "ai" && (
                <p className="font-code-sm text-code-sm text-on-surface-variant">Pulsa Sintetizar para generar el diagrama antes de crear. Con foto de pizarra/papel se usa la ruta visión ({VISION_DEFAULT_MODEL}) sin rondas; solo texto usa el agente UML.</p>
              )}
            </div>
          </div>
          {/*
          <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-outline-variant bg-surface-container-low p-3">
            <div className="flex items-center gap-4 font-code-sm text-code-sm text-on-surface-variant">
              <label className="flex cursor-pointer items-center gap-2">
                <input defaultChecked type="checkbox" className="h-3.5 w-3.5 rounded border-outline text-primary focus:ring-0" />
                <span>Auto-snap a cuadrícula (20px)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input defaultChecked type="checkbox" className="h-3.5 w-3.5 rounded border-outline text-primary focus:ring-0" />
                <span>Enrutamiento Ortogonal (90°)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" className="h-3.5 w-3.5 rounded border-outline text-primary focus:ring-0" />
                <span>Generar stubs de código TypeScript</span>
              </label>
            </div>
            <span className="font-code-sm text-code-sm text-outline">ESTÁNDAR: UML 2.5</span>
          </div>
           */}
        </div>

        {aiGenerating && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-surface/80 backdrop-blur-sm">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="mt-3 font-class-name text-class-name font-semibold text-on-surface">Sintetizando diagrama con IA...</p>
            <p className="mt-1 max-w-[80%] text-center font-code-sm text-code-sm text-on-surface-variant">
              {aiImageBase64 ? `Extrayendo esquema con ${VISION_DEFAULT_MODEL} y dibujando clases...` : "Generando clases y relaciones..."} 
            </p>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-outline-variant bg-surface-container px-6 py-4">
          <div className="flex items-center gap-2 font-code-sm text-code-sm text-outline">
            <Info className="h-4 w-4" />
            <span>
              {mode === "ai" && aiGeneratedModel ? `IA: ${aiPreview} listo` : mode === "import" && importedModel ? `Import: ${importPreview}` : "Los diagramas generados se guardan localmente."}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded border border-outline px-4 py-2 font-class-name text-class-name text-on-surface transition-colors hover:bg-surface-variant"
            >
              Cancelar
            </button>
            <button
              onClick={crear}
              disabled={creating || aiGenerating || importing}
              className="flex items-center gap-2 rounded border border-primary bg-primary px-5 py-2 font-class-name text-class-name font-semibold text-on-primary shadow-sm transition-all hover:bg-on-primary-container disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span>{creating ? "Creando..." : "Crear y abrir diagrama"}</span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
