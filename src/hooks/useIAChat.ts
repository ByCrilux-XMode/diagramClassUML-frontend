import { create } from "zustand";
import { applyPendingProposals, runAgentLoop } from "@/lib/ia/agentLoop";
import { IA_DEFAULT_PROVIDER, IA_MAX_HISTORY_TURNS } from "@/lib/ia/config";
import type { IAProvider, PendingProposal, TurnTrace } from "@/lib/ia/types";
import type { PersonaIA } from "@/lib/ia/types";
import { clearGhostPreview, confirmGhostPreview, hasGhostPreview, showGhostPreview } from "@/lib/ia/ghostPreview";
import { isVisualTool, readDiagramSnapshot, toolsForMode } from "@/lib/editorTools";
import type { AmbitoIA, ModoIA } from "@/lib/editorTools";
import { borrarPrivado, cargarPrivado, clavePrivado, guardarPrivado } from "@/lib/ia/privado";
import { toHistory } from "@/lib/ia/context/history";
import { armarContexto } from "@/lib/ia/context/builder";
import type { MensajeContexto } from "@/lib/ia/context/builder";
import { cargarFuentes } from "@/lib/ia/context/cargar";
import { perfilDeProveedor } from "@/lib/ia/providers";
import type { ContextoInfo } from "@/lib/ia/types";
import { withAiOrigin } from "@/lib/actividad/origen";
import type { OrigenIA } from "@/lib/actividad/origen";
import { nuevaClave } from "@/lib/chat/clave";
import { enviarMensaje, enviarSuceso, listarMensajes, obtenerSala } from "@/lib/chat/api";
import type { MensajeChat } from "@/lib/chat/api";
import { quizasResumirSala } from "@/lib/chat/resumen";
import { ErrorTurno, cerrarTurno, reclamarTurno } from "@/lib/turnos/api";
import { aprobarLote, crearLotePropuestas, rechazarLote, reportarResultado } from "@/lib/propuestas/api";
import type { PropuestaApi, TurnoPendiente } from "@/lib/propuestas/tipos";
import type { RolProyecto } from "@/types/proyecto";
import { formatearAvisoFallback, resolverCadena } from "@/lib/ia/router";
import type { ConfigCadena, TareaIA, TramoProveedor } from "@/lib/ia/router";
import { obtenerConfigIa, actualizarConfigIa } from "@/lib/config-ia/api";
import type { ConfigIaApi } from "@/lib/config-ia/api";
import { leerConformidadCache, probarConformidad as ejecutarSondaConformidad } from "@/lib/ia/conformidad";
import type { ResultadoConformidad } from "@/lib/ia/conformidad";
import { mensajeDeErrorIA } from "@/lib/ia/proxy";

export interface ChatEntry {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  trace: TurnTrace[];
  notice?: string;
  /** Solo si el turno recortó contexto. */
  contexto?: ContextoInfo;
}

interface Salud {
  ok: boolean;
  error?: string;
}

interface ContextoUsuario {
  usuarioId: number | null;
  nombre: string;
  puedeEditar: boolean;
  /**
   * Rol en el proyecto. El CREADOR es el único que puede cambiar el
   * proveedor/modelo del apartado GRUPAL (el backend de config_ia lo exige);
   * el resto de las personas usa la selección guardada en el proyecto.
   */
  rol?: RolProyecto | null;
}

interface ResponderEnChatInput {
  proyectoId: string;
  prompt: string;
  puedeEditar: boolean;
  /** Mensaje persistido que disparó el turno; se excluye del historial. */
  mensajeId?: string;
}

interface IAChatState {
  proveedor: IAProvider;
  modelo: string;
  /** Modelo del ámbito PRIVADO: siempre HF Space — modelo propio (D43). */
  modeloPrivado: string;
  modelos: string[];
  pensando: boolean;
  /** Modo de edición de la IA. Solo lo mueve una persona (D38). */
  modo: ModoIA;
  /** Ámbito de la conversación: `privado` fuerza modo plan (D43). */
  ambito: AmbitoIA;
  mensajes: ChatEntry[];
  trace: TurnTrace[];
  error: string | null;
  salud: Salud | null;
  checking: boolean;
  pendingProposals: PendingProposal[] | null;
  propuestaResumen: string | null;
  /** Turno que este navegador está aplicando; evita dobles clics. */
  resolviendoTurno: string | null;
  /** Último plan redactado por la IA en modo `plan`; es lo que se puede guardar. */
  ultimoPlan: string | null;
  proyectoActivoId: string | null;
  usuario: ContextoUsuario;
  /** Configuración de proveedores del proyecto; `null` usa los defaults (D59). */
  configIa: ConfigIaApi | null;
  /** Aviso discreto cuando respondió un tramo de respaldo (D62). */
  avisoFallback: string | null;
  /** Aviso cuando la selección GRUPAL no se pudo guardar en el proyecto. */
  avisoConfig: string | null;
  /** Última sonda de conformidad del proveedor/modelo seleccionados. */
  conformidad: ResultadoConformidad | null;
  probandoConformidad: boolean;
  setProyectoActivo: (proyectoId: string | null) => void;
  setContextoUsuario: (usuario: {
    usuarioId?: number | null;
    nombre: string;
    puedeEditar: boolean;
    rol?: RolProyecto | null;
  }) => void;
  setProveedor: (p: IAProvider) => void;
  setModelo: (m: string) => void;
  /** Modelo local del ámbito privado (HF Space); no viaja al proyecto. */
  setModeloPrivado: (m: string) => void;
  setModo: (m: ModoIA) => void;
  setAmbito: (a: AmbitoIA) => void;
  setModelos: (modelos: string[]) => void;
  cargarModelos: (p?: IAProvider) => Promise<void>;
  verificarSalud: (p?: IAProvider) => Promise<void>;
  /** Trae `config_ia` del proyecto; si falla, se usan los defaults sin bloquear. */
  cargarConfigIa: (proyectoId?: string | null) => Promise<void>;
  /** Lanza la sonda de conformidad del proveedor/modelo seleccionados. */
  probarConformidad: (p?: IAProvider, m?: string, forzar?: boolean) => Promise<void>;
  enviar: (prompt: string) => Promise<void>;
  /** Turno pedido desde el chat grupal. Persiste la respuesta en la sala. */
  responderEnChat: (input: ResponderEnChatInput) => Promise<void>;
  aprobarTurno: (turno: TurnoPendiente) => Promise<void>;
  rechazarTurno: (turno: TurnoPendiente) => Promise<void>;
  reiniciar: () => void;
}

let chatSeq = 0;
function nextId(): string {
  chatSeq += 1;
  return `msg-${Date.now()}-${chatSeq}`;
}

function personaDe(usuario: ContextoUsuario): PersonaIA {
  return { usuarioId: usuario.usuarioId ?? 0, nombre: usuario.nombre };
}

/** Proveedores que el selector puede fijar; Ollama queda fuera (D61). */
const PROVEEDORES_SELECTOR: readonly IAProvider[] = ["hf-space", "huggingface", "openrouter"];

function proveedorSeleccionable(proveedor: IAProvider): IAProvider {
  if (PROVEEDORES_SELECTOR.includes(proveedor)) return proveedor;
  return PROVEEDORES_SELECTOR.includes(IA_DEFAULT_PROVIDER) ? IA_DEFAULT_PROVIDER : "openrouter";
}

/**
 * Proveedor/modelo que realmente usa el turno según el ámbito.
 * El privado nunca sale de HF Space — modelo propio; el grupal respeta la
 * selección (compartida vía `config_ia` cuando la fija el CREADOR).
 */
function proveedorEfectivo(
  estado: Pick<IAChatState, "ambito" | "proveedor">,
): IAProvider {
  return estado.ambito === "privado" ? "hf-space" : estado.proveedor;
}

function modeloEfectivo(
  estado: Pick<IAChatState, "ambito" | "modelo" | "modeloPrivado">,
): string {
  return (estado.ambito === "privado" ? estado.modeloPrivado : estado.modelo).trim();
}

/**
 * Guarda la selección GRUPAL en el proyecto. Solo el CREADOR puede: el
 * backend de `config_ia` devuelve 403 para el resto, y acá ni se intenta.
 * Es best-effort: un fallo deja un aviso en el panel pero no rompe el turno.
 */
async function persistirSeleccion(
  get: () => IAChatState,
  set: (parcial: Partial<IAChatState>) => void,
): Promise<void> {
  const { proyectoActivoId, usuario, proveedor, modelo } = get();
  if (!proyectoActivoId || usuario.rol !== "CREADOR") return;
  set({ avisoConfig: null });
  try {
    await actualizarConfigIa(proyectoActivoId, {
      proveedor,
      modelo: modelo.trim() || null,
    });
  } catch (err: unknown) {
    if (get().proyectoActivoId !== proyectoActivoId) return;
    const status = (err as { response?: { status?: number } })?.response?.status;
    set({
      avisoConfig:
        status === 403
          ? "Tu rol no puede cambiar el modelo del proyecto."
          : "No se pudo guardar la selección en el proyecto; se usará solo en este navegador.",
    });
  }
}

function configParaCadena(configIa: ConfigIaApi | null): ConfigCadena | null {
  return configIa ? { cadenas: configIa.cadenas } : null;
}

/**
 * Cadena efectiva del turno (D59): `config_ia` → `.env` → D55. El proveedor
 * elegido en el selector fija solo el primer tramo y no se repite después.
 *
 * El pin depende del ámbito: GRUPAL usa la selección compartida del proyecto
 * (la fija el CREADOR); PRIVADO va siempre a HF Space — modelo propio con el
 * modelo local de cada persona (D43).
 */
function resolverParaTurno(estado: IAChatState, tarea: TareaIA): TramoProveedor[] {
  const pin = { proveedor: proveedorEfectivo(estado), modelo: modeloEfectivo(estado) || null };
  try {
    return resolverCadena({ tarea, config: configParaCadena(estado.configIa), pinPersona: pin });
  } catch (err: unknown) {
    // Configuración inválida (por ejemplo un `ollama` heredado en `.env`): el
    // turno no se bloquea, se usan los defaults de D55.
    console.warn(
      `[ia:router] configuración inválida para ${tarea}; se usan los defaults`,
      err instanceof Error ? err.message : err,
    );
    return resolverCadena({ tarea });
  }
}

/** Convierte las propuestas persistidas en el formato que ejecutan las tools. */
function aPendingProposals(propuestas: PropuestaApi[]): PendingProposal[] {
  return propuestas.map((propuesta) => ({
    id: propuesta.clavePropuesta,
    toolName: propuesta.toolName,
    args: propuesta.args,
    round: propuesta.round,
    turnoId: propuesta.turnoId,
    modelo: propuesta.modelo ?? undefined,
    solicitadoPor: propuesta.solicitadoPor,
    proyectoId: String(propuesta.proyectoId),
  }));
}

// ---------------------------------------------------------------------------
// Preferencias locales: modo y ámbito por proyecto y persona (D38, D43).
// Nunca viajan al servidor ni se comparten entre pestañas.
// ---------------------------------------------------------------------------

const AMBITOS: readonly AmbitoIA[] = ["grupo", "privado"];
const MODOS: readonly ModoIA[] = ["plan", "build"];

function claveLocal(
  base: "modo" | "ambito" | "modeloPrivado",
  proyectoId: string | null,
  usuarioId: number | null | undefined,
): string | null {
  if (!proyectoId || usuarioId === null || usuarioId === undefined) return null;
  return `ia.${base}:${proyectoId}:${usuarioId}`;
}

function leerLocal<T extends string>(
  base: "modo" | "ambito" | "modeloPrivado",
  proyectoId: string | null,
  usuarioId: number | null | undefined,
  /** `null` = cualquier valor guardado (texto libre, p. ej. un modelo). */
  permitidos: readonly T[] | null,
  defecto: T,
): T {
  const clave = claveLocal(base, proyectoId, usuarioId);
  if (!clave || typeof window === "undefined") return defecto;
  try {
    const crudo = window.localStorage.getItem(clave);
    if (crudo && (!permitidos || (permitidos as readonly string[]).includes(crudo))) {
      return crudo as T;
    }
  } catch {
    // sin localStorage disponible: se queda con el valor por defecto
  }
  return defecto;
}

function escribirLocal(
  base: "modo" | "ambito" | "modeloPrivado",
  proyectoId: string | null,
  usuarioId: number | null | undefined,
  valor: string,
): void {
  const clave = claveLocal(base, proyectoId, usuarioId);
  if (!clave || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    // cuota llena: la preferencia se pierde pero no rompe el turno
  }
}

/** Historial privado local, ya filtrado y limitado por `toHistory`. */
function historialLocal(entradas: ChatEntry[]): MensajeContexto[] {
  return toHistory(entradas, IA_MAX_HISTORY_TURNS)
    .filter((mensaje) => mensaje.role === "user" || mensaje.role === "assistant")
    .map((mensaje) => ({
      role: mensaje.role as "user" | "assistant",
      content: mensaje.content,
    }));
}

/** Carga las capas del proyecto y arma el contexto del turno. */
async function armarContextoParaTurno(input: {
  proyectoId: string | null;
  ambito: AmbitoIA;
  modo: ModoIA;
  rol: RolProyecto | null;
  provider: IAProvider;
  mensajeActual: string;
  mensajesLocal?: MensajeContexto[];
  excluirMensajeId?: string;
}) {
  const fuentes = await cargarFuentes(input.proyectoId, {
    incluirConversacion: input.ambito === "grupo",
    excluirMensajeId: input.excluirMensajeId,
  });
  // D52: el privado usa su historial local y nunca la conversación grupal.
  if (input.ambito === "privado" && input.mensajesLocal) {
    fuentes.mensajes = input.mensajesLocal;
  }

  return armarContexto({
    fuentes,
    snapshot: readDiagramSnapshot(),
    ambito: input.ambito,
    modo: input.modo,
    rol: input.rol,
    perfil: perfilDeProveedor(input.provider),
    tools: toolsForMode({ ambito: input.ambito, modo: input.modo, rol: input.rol }),
    mensajeActual: input.mensajeActual,
  });
}

/**
 * Resumen rodante best-effort. Se lanza después de publicar la respuesta y no
 * se espera: si falla, el turno ya terminó y el grupo no ve el error (D50).
 */
function resumirSalaEnSegundoPlano(proyectoId: string, config: ConfigCadena | null): void {
  void (async () => {
    try {
      let cadena: TramoProveedor[];
      try {
        cadena = resolverCadena({ tarea: "resumen", config });
      } catch {
        cadena = resolverCadena({ tarea: "resumen" });
      }
      const [sala, lista] = await Promise.all([
        obtenerSala(proyectoId),
        listarMensajes(proyectoId, { limite: 100 }),
      ]);
      const mensajes = [...lista.datos].sort(
        (a, b) => new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime(),
      );
      const resultado = await quizasResumirSala({
        proyectoId,
        mensajes,
        resumen: sala.resumen,
        cadena,
      });
      if (!resultado.actualizado && resultado.motivo && resultado.motivo !== "umbral") {
        console.warn(`[ia:resumen] no se actualizó: ${resultado.motivo}`);
      }
    } catch (err: unknown) {
      console.warn("[ia:resumen] no se pudo generar el resumen", err);
    }
  })();
}

// Sin modelo elegido se usa el default del tramo en el servidor. Fijar aquí un
// `IA_DEFAULT_MODEL` no sirve en el navegador (solo llegan las claves
// `NEXT_PUBLIC_*`) y podía mandar un tag de Ollama a OpenRouter.
const modeloInicial = "";

/** Restaura modo, ámbito y chat privado del proyecto y la persona actuales. */
function cargarLocal(
  get: () => IAChatState,
  set: (parcial: Partial<IAChatState>) => void,
): void {
  const { proyectoActivoId, usuario } = get();
  if (!proyectoActivoId) return;
  const uid = usuario.usuarioId;
  set({
    ambito: leerLocal<AmbitoIA>("ambito", proyectoActivoId, uid, AMBITOS, "grupo"),
    modo: leerLocal<ModoIA>("modo", proyectoActivoId, uid, MODOS, "plan"),
    modeloPrivado: leerLocal<string>("modeloPrivado", proyectoActivoId, uid, null, ""),
    mensajes: cargarPrivado<ChatEntry>(clavePrivado(proyectoActivoId, uid)),
  });
}

/** Guarda el chat privado en el navegador. Silencioso si no hay claves. */
function persistirMensajes(get: () => IAChatState): void {
  const { proyectoActivoId, usuario, mensajes } = get();
  guardarPrivado(clavePrivado(proyectoActivoId, usuario.usuarioId), mensajes);
}

export const useIAChat = create<IAChatState>((set, get) => ({
  proveedor: proveedorSeleccionable(IA_DEFAULT_PROVIDER),
  modelo: modeloInicial,
  modeloPrivado: "",
  modelos: [],
  pensando: false,
  modo: "plan",
  ambito: "grupo",
  mensajes: [],
  trace: [],
  error: null,
  salud: null,
  checking: false,
  pendingProposals: null,
  propuestaResumen: null,
  resolviendoTurno: null,
  ultimoPlan: null,
  proyectoActivoId: null,
  usuario: { usuarioId: null, nombre: "Usuario", puedeEditar: false },
  configIa: null,
  avisoFallback: null,
  avisoConfig: null,
  conformidad: null,
  probandoConformidad: false,

  setProyectoActivo(proyectoId) {
    const anterior = get().proyectoActivoId;
    if (anterior === proyectoId) return;
    // El historial pertenece a un solo proyecto: al cambiar de editor se
    // reinicia el chat visible. La selección de proveedor y modelo se conserva.
    try {
      clearGhostPreview();
    } catch {
      // sin diagrama montado no hay nada que limpiar
    }
    set({
      proyectoActivoId: proyectoId,
      mensajes: [],
      trace: [],
      error: null,
      pendingProposals: null,
      propuestaResumen: null,
      resolviendoTurno: null,
      ultimoPlan: null,
      pensando: false,
      configIa: null,
      avisoFallback: null,
      avisoConfig: null,
      conformidad: null,
    });
    cargarLocal(get, set);
    // D59: la cadena la decide el proyecto. Si la carga falla, los defaults de
    // `.env`/D55 mantienen el turno funcionando.
    if (proyectoId) void get().cargarConfigIa(proyectoId);
  },

  setContextoUsuario({ usuarioId = null, nombre, puedeEditar, rol = null }) {
    set({ usuario: { usuarioId, nombre, puedeEditar, rol } });
    cargarLocal(get, set);
  },

  setModo(modo) {
    const { proyectoActivoId, usuario } = get();
    escribirLocal("modo", proyectoActivoId, usuario.usuarioId, modo);
    set({ modo });
  },

  setAmbito(ambito) {
    const { proyectoActivoId, usuario } = get();
    escribirLocal("ambito", proyectoActivoId, usuario.usuarioId, ambito);
    // El badge de conformidad depende de qué modelo va a usar el turno:
    // al cambiar de ámbito se relee de la caché (D60) para no mostrar la
    // sonda del otro proveedor.
    const estado = get();
    const proveedor = proveedorEfectivo({ ...estado, ambito });
    const modelo = modeloEfectivo({ ...estado, ambito });
    set({
      ambito,
      error: null,
      avisoFallback: null,
      conformidad: modelo ? leerConformidadCache(proveedor, modelo) : null,
    });
  },

  setProveedor(p) {
    // Ollama no es una opción del selector (D61): un valor heredado cae al
    // proveedor por defecto en lugar de romper el turno.
    const proveedor = proveedorSeleccionable(p);
    set({
      proveedor,
      modelo: "",
      modelos: [],
      error: null,
      conformidad: null,
      avisoFallback: null,
      avisoConfig: null,
    });
    // El CREADOR fija el modelo del proyecto: los colaboradores lo cargan
    // con config_ia y lo usan en sus turnos.
    void persistirSeleccion(get, set);
  },

  setModelo(m) {
    // D60: la caché se invalida al cambiar de modelo.
    set({ modelo: m, error: null, avisoConfig: null, conformidad: leerConformidadCache(get().proveedor, m) });
    void persistirSeleccion(get, set);
  },

  setModeloPrivado(m) {
    // El privado es local por persona (D43): no se guarda en el proyecto.
    const { proyectoActivoId, usuario } = get();
    escribirLocal("modeloPrivado", proyectoActivoId, usuario.usuarioId, m);
    set({
      modeloPrivado: m,
      error: null,
      conformidad: m.trim() ? leerConformidadCache("hf-space", m.trim()) : null,
    });
  },

  setModelos(modelos) {
    set({ modelos });
  },

  async cargarModelos(p) {
    const provider = p ?? proveedorEfectivo(get());
    try {
      const res = await fetch(`/api/ia/models?provider=${encodeURIComponent(provider)}`);
      const data = (await res.json().catch(() => ({}))) as {
        models?: string[];
        error?: string;
      };
      if (!res.ok) {
        set({ modelos: [], error: data.error ?? "No se pudieron listar los modelos." });
        return;
      }
      set({ modelos: data.models ?? [], error: null });
    } catch (err: unknown) {
      set({
        modelos: [],
        error: err instanceof Error ? err.message : "No se pudieron listar los modelos.",
      });
    }
  },

  async verificarSalud(p) {
    const provider = p ?? proveedorEfectivo(get());
    set({ checking: true });
    try {
      const res = await fetch(`/api/ia/health?provider=${encodeURIComponent(provider)}`);
      const data = (await res.json().catch(() => ({}))) as Salud;
      set({ salud: data, checking: false });
    } catch {
      set({
        salud: { ok: false, error: "Sin conexión con el proveedor." },
        checking: false,
      });
    }
  },

  async cargarConfigIa(proyectoId) {
    const id = proyectoId ?? get().proyectoActivoId;
    if (!id) return;
    try {
      const configIa = await obtenerConfigIa(id);
      // Evita pisar el proyecto nuevo con una respuesta tardía del anterior.
      if (get().proyectoActivoId !== id) return;
      set({ configIa });
      // La selección que fijó el CREADOR manda para todas las personas:
      // es lo que hace que los colaboradores usen ese mismo modelo.
      if (!configIa.porDefecto && configIa.proveedor) {
        const proveedor = proveedorSeleccionable(configIa.proveedor);
        const modelo = configIa.modelo?.trim() ?? "";
        if (proveedor !== get().proveedor || modelo !== get().modelo) {
          set({
            proveedor,
            modelo,
            conformidad: modelo ? leerConformidadCache(proveedor, modelo) : null,
          });
        }
      }
    } catch {
      // Sin configuración se usan los defaults de `.env`/D55; el turno sigue.
      if (get().proyectoActivoId === id) set({ configIa: null });
    }
  },

  async probarConformidad(p, m, forzar) {
    const proveedor = p ?? proveedorEfectivo(get());
    const modelo = (m ?? modeloEfectivo(get())).trim();
    if (!modelo) {
      set({
        conformidad: null,
        error: "Elige un modelo antes de probar la conformidad.",
      });
      return;
    }
    set({ probandoConformidad: true });
    const resultado = await ejecutarSondaConformidad({ proveedor, modelo, forzar });
    set({ conformidad: resultado, probandoConformidad: false });
  },

  async enviar(prompt) {
    const { pensando, usuario, proyectoActivoId } = get();
    if (pensando) return;
    const trimmed = prompt.trim();
    if (!trimmed) return;

    const turnoId = nuevaClave();
    const solicitadoPor = personaDe(usuario);

    set({ pensando: true, error: null, trace: [] });
    // El historial local se arma antes de añadir el mensaje actual: el turno en
    // curso viaja aparte como `userMessage`.
    const mensajesLocal = historialLocal(get().mensajes);
    const rol: RolProyecto = get().usuario.puedeEditar ? "EDITOR" : "LECTOR";
    const userEntry: ChatEntry = { id: nextId(), role: "user", content: trimmed, trace: [] };
    set((s) => ({ mensajes: [...s.mensajes, userEntry] }));

    try {
      // Consulta privada: cadena de `consulta` (D55) con el selector como pin.
      const cadena = resolverParaTurno(get(), "consulta");
      // D52: el privado recibe las capas del proyecto en solo lectura y su
      // historial local; nunca el resumen ni los mensajes del grupo.
      const armado = await armarContextoParaTurno({
        proyectoId: proyectoActivoId,
        ambito: "privado",
        modo: "plan",
        rol,
        provider: cadena[0]?.proveedor ?? get().proveedor,
        mensajeActual: trimmed,
        mensajesLocal,
      });

      const result = await runAgentLoop({
        cadena,
        systemPrompt: armado.systemPrompt,
        userMessage: trimmed,
        history: armado.history,
        contextoCapas: armado.capas,
        contextoDegradado: armado.degradado,
        // El ámbito privado es modo plan por construcción (D43): no se consulta
        // la preferencia guardada de la persona.
        ambito: "privado",
        modo: "plan",
        rol,
        turnoId,
        solicitadoPor,
        proyectoId: proyectoActivoId,
        onTurn: (turn) => set((s) => ({ trace: [...s.trace, turn] })),
      });
      const avisoFallback = formatearAvisoFallback(result.fallbacks, result.proveedorUsado);
      set({ avisoFallback });
      if (result.hitlRequired && result.pendingProposals && result.pendingProposals.length > 0) {
        const resumen = result.finalContent.trim() || "Propuesta lista para revisión humana.";
        const propuestaEntry: ChatEntry = {
          id: nextId(),
          role: "assistant",
          content: resumen,
          trace: result.trace,
          notice: `Propuesta: ${result.pendingProposals.length} cambio(s) pendiente(s) de aprobación humana.`,
          contexto: result.contexto,
        };
        set((s) => ({
          mensajes: [...s.mensajes, propuestaEntry],
          trace: result.trace,
          pendingProposals: result.pendingProposals ?? null,
          propuestaResumen: resumen,
        }));
        // Mostrar preview fantasma en el diagramador (opaco)
        try {
          showGhostPreview(result.pendingProposals ?? []);
        } catch {}
        return;
      }
      const assistantEntry: ChatEntry = {
        id: nextId(),
        role: "assistant",
        content: result.finalContent.trim() || "Sin respuesta del modelo.",
        trace: result.trace,
        contexto: result.contexto,
      };
      set((s) => ({
        mensajes: [...s.mensajes, assistantEntry],
        trace: result.trace,
        // En privado siempre hay modo plan: la respuesta es candidata a plan.
        ultimoPlan: assistantEntry.content,
      }));
    } catch (err: unknown) {
      const failEntry: ChatEntry = {
        id: nextId(),
        role: "system",
        content: mensajeDeErrorIA(err),
        trace: [],
      };
      set((s) => ({ mensajes: [...s.mensajes, failEntry] }));
    } finally {
      persistirMensajes(get);
      set({ pensando: false });
    }
  },

  async responderEnChat({ proyectoId, prompt, puedeEditar, mensajeId }) {
    const { proveedor, modelo, pensando, usuario, modo } = get();
    if (pensando) return;
    const texto = prompt.trim();
    if (!texto) return;

    const turnoId = nuevaClave();
    const solicitadoPor = personaDe(usuario);
    // CREADOR y EDITOR comparten fila en la tabla de modos (D39).
    const rol = puedeEditar ? ("EDITOR" as const) : ("LECTOR" as const);
    // `build` propone ediciones (cadena fuerte); `plan` es consulta.
    const tarea: TareaIA = modo === "build" ? "edicion" : "consulta";
    const cadena = resolverParaTurno(get(), tarea);
    set({ pensando: true, error: null, trace: [] });

    // D41/D42: en el ámbito grupo el turno se reclama antes de correr el loop;
    // el servidor valida el modo contra el rol y excluye a dos personas a la vez.
    let turnoServidor: string | null = null;
    let proveedorUsado = cadena[0]?.proveedor ?? proveedor;
    let modeloUsado = modelo;
    try {
      const reclamado = await reclamarTurno(proyectoId, {
        modo,
        mensajeId,
        proveedor,
        modelo,
      });
      turnoServidor = reclamado.turno._id;
    } catch (err: unknown) {
      const motivo =
        err instanceof ErrorTurno ? err.message : "No se pudo iniciar el turno de la IA.";
      set({ error: motivo, pensando: false });
      return;
    }

    let falloTurno: string | null = null;
    try {
      // D44/D52: el loader trae las capas del proyecto y el builder decide qué
      // cabe. El mensaje que disparó el turno ya está persistido y viaja como
      // `userMessage`: se excluye por id para no enviarlo dos veces.
      const armado = await armarContextoParaTurno({
        proyectoId,
        ambito: "grupo",
        modo,
        rol,
        provider: cadena[0]?.proveedor ?? proveedor,
        mensajeActual: texto,
        excluirMensajeId: mensajeId,
      });

      const result = await runAgentLoop({
        cadena,
        systemPrompt: armado.systemPrompt,
        userMessage: texto,
        history: armado.history,
        contextoCapas: armado.capas,
        contextoDegradado: armado.degradado,
        // D37: el set de tools y el candado salen de los tres ejes. El rol se
        // deriva del permiso de edición: CREADOR y EDITOR comparten fila.
        ambito: "grupo",
        modo,
        rol,
        turnoId,
        solicitadoPor,
        proyectoId,
        onTurn: (turn) => set((s) => ({ trace: [...s.trace, turn] })),
      });

      // D62: se registra quién respondió, no quién estaba elegido.
      proveedorUsado = result.proveedorUsado ?? proveedorUsado;
      modeloUsado = result.modeloUsado ?? modelo;
      set({ avisoFallback: formatearAvisoFallback(result.fallbacks, result.proveedorUsado) });

      const respuesta = result.finalContent.trim() || "Propuesta lista para revisión humana.";
      if (modo === "plan") set({ ultimoPlan: respuesta });
      let publicada = false;
      let mensajeRespondido: string | undefined;
      try {
        const { mensaje } = await enviarMensaje(proyectoId, {
          autorTipo: "ia",
          contenido: respuesta,
          modelo: modeloUsado,
          turnoId,
          solicitadoPor,
          claveIdempotencia: nuevaClave(),
        });
        mensajeRespondido = mensaje._id;
        publicada = true;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        set({ error: `No se pudo publicar la respuesta: ${message}` });
      }

      // D32: las propuestas se persisten después del mensaje de la IA; si falla
      // el lote, la conversación conserva la explicación y no queda huérfana.
      if (
        publicada &&
        result.hitlRequired &&
        result.pendingProposals &&
        result.pendingProposals.length > 0
      ) {
        try {
          await crearLotePropuestas(proyectoId, {
            turnoId,
            mensajeId: mensajeRespondido,
            modelo: modeloUsado,
            propuestas: result.pendingProposals.map((propuesta, indice) => ({
              clavePropuesta: propuesta.id || `${turnoId}-${indice}`,
              toolName: propuesta.toolName,
              args: propuesta.args,
              round: propuesta.round,
            })),
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          set({ error: `No se pudo registrar la propuesta: ${message}` });
        }
      }

      // D50: el resumen es auxiliar. Se lanza después de publicar y no se
      // espera; un LECTOR no tiene permiso de escritura y no lo intenta.
      if (publicada && puedeEditar) {
        resumirSalaEnSegundoPlano(proyectoId, configParaCadena(get().configIa));
      }

      if (result.hitlRequired && result.pendingProposals && result.pendingProposals.length > 0) {
        set({
          pendingProposals: result.pendingProposals,
          propuestaResumen: respuesta,
          trace: result.trace,
          pensando: false,
        });
        try {
          showGhostPreview(result.pendingProposals);
        } catch {}
        return;
      }

      // La respuesta llega al chat por SSE; el store privado no la duplica.
      set({ trace: result.trace, pensando: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      falloTurno = message;
      // D23: un fallo de red de una persona no se publica en el grupo. La
      // sesión vencida y el servicio caído tienen su propio mensaje (fase 9).
      set({
        error: mensajeDeErrorIA(err),
        pensando: false,
      });
    } finally {
      // 8.8: el turno se libera siempre, tanto en éxito como en error.
      if (turnoServidor) {
        try {
          await cerrarTurno(proyectoId, turnoServidor, {
            estado: falloTurno ? "error" : "listo",
            motivo: falloTurno ?? undefined,
            // D62: se cierra con el tramo que respondió, no con el del claim.
            proveedor: proveedorUsado,
            modelo: modeloUsado,
          });
        } catch {
          // el arriendo libera el turno si este navegador no pudo reportar
        }
      }
      if (get().pensando) set({ pensando: false });
    }
  },

  async aprobarTurno(turno) {
    const estado = get();
    const proyectoId = estado.proyectoActivoId;
    if (!proyectoId || estado.resolviendoTurno) return;
    if (turno.propuestas.some((propuesta) => String(propuesta.proyectoId) !== String(proyectoId))) {
      set({ error: "La propuesta pertenece a otro proyecto; vuelve a pedirla en este diagrama." });
      return;
    }

    set({ resolviendoTurno: turno.turnoId, error: null });

    let reclamado: { turnoId: string; propuestas: PropuestaApi[] };
    try {
      // D29: se reclama en el servidor antes de ejecutar una sola herramienta.
      reclamado = await aprobarLote(proyectoId, turno.turnoId);
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : "No se pudo reclamar el turno.",
        resolviendoTurno: null,
      });
      return;
    }

    const pendientes = aPendingProposals(reclamado.propuestas);
    const esLocal = Boolean(
      estado.pendingProposals?.some((propuesta) => propuesta.turnoId === turno.turnoId),
    );
    const origen: OrigenIA = {
      turnoId: turno.turnoId,
      modelo: turno.modelo ?? estado.modelo,
      solicitadoPor: turno.solicitadoPor,
      proyectoId,
    };

    let totalApplied = 0;
    let extraErrors: string[] = [];
    let extraTrace: TurnTrace[] = [];
    let ghostTrace: TurnTrace[] = [];

    try {
      // Una sola apertura por aprobación: `confirmGhost` y las tools no visuales
      // pertenecen al mismo turno, aunque generen varias transacciones.
      withAiOrigin(origen, () => {
        if (esLocal && hasGhostPreview()) {
          confirmGhostPreview();
          const nonGhost = pendientes.filter((propuesta) => !isVisualTool(propuesta.toolName));
          if (nonGhost.length > 0) {
            const resultado = applyPendingProposals(nonGhost);
            extraTrace = resultado.trace;
            extraErrors = resultado.errors;
          }
          const ghostCount = pendientes.length - nonGhost.length;
          totalApplied = ghostCount + (nonGhost.length - extraErrors.length);
          ghostTrace = pendientes
            .filter((propuesta) => isVisualTool(propuesta.toolName))
            .map((propuesta) => ({
              round: propuesta.round,
              toolName: propuesta.toolName,
              ok: true,
            }));
        } else {
          const resultado = applyPendingProposals(pendientes);
          extraTrace = resultado.trace;
          totalApplied = resultado.applied;
          extraErrors = resultado.errors;
        }
      });
    } catch (err: unknown) {
      extraErrors = [...extraErrors, err instanceof Error ? err.message : String(err)];
    }

    const traceFinal = [...ghostTrace, ...extraTrace];
    set({
      trace: traceFinal,
      pendingProposals: esLocal ? null : estado.pendingProposals,
      propuestaResumen: esLocal ? null : estado.propuestaResumen,
    });

    // D27: el navegador que aplicó es el único que sabe qué devolvieron las
    // herramientas; por eso reporta el resultado real.
    try {
      await reportarResultado(proyectoId, turno.turnoId, {
        estado: extraErrors.length > 0 ? "error" : "aplicada",
        aplicadas: totalApplied,
        errores: extraErrors,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
    }

    try {
      await enviarSuceso(proyectoId, {
        tipo: "propuesta.aplicada",
        turnoId: turno.turnoId,
        cambios: totalApplied,
        errores: extraErrors,
        claveIdempotencia: nuevaClave(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: `Los cambios se aplicaron, pero el chat no pudo registrarlo: ${message}` });
    } finally {
      set({ resolviendoTurno: null });
    }
  },

  async rechazarTurno(turno) {
    const estado = get();
    const proyectoId = estado.proyectoActivoId;
    if (!proyectoId || estado.resolviendoTurno) return;

    set({ resolviendoTurno: turno.turnoId, error: null });
    try {
      await rechazarLote(proyectoId, turno.turnoId);
    } catch (err: unknown) {
      set({
        error: err instanceof Error ? err.message : "No se pudo rechazar el turno.",
        resolviendoTurno: null,
      });
      return;
    }

    const esLocal = Boolean(
      estado.pendingProposals?.some((propuesta) => propuesta.turnoId === turno.turnoId),
    );
    if (esLocal) {
      try {
        clearGhostPreview();
      } catch {}
    }
    set({
      trace: [],
      pendingProposals: esLocal ? null : estado.pendingProposals,
      propuestaResumen: esLocal ? null : estado.propuestaResumen,
    });

    try {
      await enviarSuceso(proyectoId, {
        tipo: "propuesta.descartada",
        turnoId: turno.turnoId,
        cambios: turno.propuestas.length,
        errores: [],
        claveIdempotencia: nuevaClave(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: `La propuesta se descartó, pero el chat no pudo registrarlo: ${message}` });
    } finally {
      set({ resolviendoTurno: null });
    }
  },

  reiniciar() {
    try {
      clearGhostPreview();
    } catch {}
    // La limpiada borra también la clave local del chat privado (D43).
    const { proyectoActivoId, usuario } = get();
    borrarPrivado(clavePrivado(proyectoActivoId, usuario.usuarioId));
    set({
      mensajes: [],
      trace: [],
      error: null,
      pendingProposals: null,
      propuestaResumen: null,
      resolviendoTurno: null,
      ultimoPlan: null,
      avisoFallback: null,
      conformidad: null,
    });
  },
}));
