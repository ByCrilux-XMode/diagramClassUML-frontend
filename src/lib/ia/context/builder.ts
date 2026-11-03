import type { DiagramState } from "@/lib/editorTools";
import { modoEfectivo } from "@/lib/editorTools";
import type { AmbitoIA, ModoIA } from "@/lib/editorTools";
import type { RolProyecto } from "@/types/proyecto";
import type { ProviderProfile } from "../providers";
import type { CapaContexto, IAChatMessage, IAToolDef } from "../types";
import { SYSTEM_PROMPT } from "../prompt";
import {
  CHARS_POR_TOKEN,
  agruparEnBloques,
  calcularPresupuesto,
  estimateMessagesTokens,
  estimateTokens,
  recortarHastaPrimerUsuario,
} from "./budget";
import { CAPAS, ORDEN_RECORTE, capaPorId } from "./capas";
import type { IdCapa } from "./capas";

/**
 * Builder puro del contexto (D44).
 *
 * Recibe datos ya cargados y devuelve el system prompt por capas, el historial
 * filtrado y el diagnóstico. No hace red ni toca GoJS: se puede probar con
 * objetos y es el único lugar donde vive la política de recorte.
 */

export interface ColaboradorContexto {
  usuarioId: number;
  nombre: string;
  rol: string;
  username?: string;
}

export interface EventoContexto {
  creadoEn: string;
  actorNombre: string;
  actorTipo: string;
  tipo: string;
  resumen: string;
  entidades?: string[];
}

export interface PlanContexto {
  version: number;
  contenido: string;
  autorNombre: string;
  creadoEn: string;
  origen: string;
}

export interface ResumenContexto {
  texto: string;
  hastaCreadoEn: string;
  modelo?: string | null;
}

export interface MensajeContexto {
  role: "user" | "assistant";
  content: string;
  creadoEn?: string;
}

export interface FuentesContexto {
  colaboradores?: ColaboradorContexto[];
  actividad?: EventoContexto[];
  plan?: PlanContexto | null;
  resumen?: ResumenContexto | null;
  mensajes?: MensajeContexto[];
  degradado?: string[];
}

export interface ArmarContextoParams {
  fuentes: FuentesContexto;
  snapshot?: DiagramState;
  ambito: AmbitoIA;
  modo: ModoIA;
  rol: RolProyecto | null;
  perfil: ProviderProfile;
  tools: IAToolDef[];
  /** Mensaje actual del turno; se reserva antes de repartir el presupuesto. */
  mensajeActual: string;
}

export interface ContextoArmado {
  systemPrompt: string;
  history: IAChatMessage[];
  capas: CapaContexto[];
  degradado: string[];
}

interface Render {
  texto: string;
  recortada: boolean;
}

const MARCA_CAPA = "\n[…capa recortada por presupuesto de contexto]";

function recortarTexto(texto: string, limiteTokens: number, marca = MARCA_CAPA): Render {
  if (limiteTokens <= 0) return { texto: "", recortada: texto !== "" };
  if (estimateTokens(texto) <= limiteTokens) return { texto, recortada: false };
  const maxChars = Math.max(0, Math.floor(limiteTokens * CHARS_POR_TOKEN) - marca.length);
  return { texto: texto.slice(0, maxChars) + marca, recortada: true };
}

function fechaCorta(iso: string | undefined): string {
  if (!iso) return "sin fecha";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "sin fecha";
  return fecha.toISOString().slice(0, 10);
}

function renderRolYModo(
  ambito: AmbitoIA,
  modo: ModoIA,
  rol: RolProyecto | null,
): Render {
  const efectivo = modoEfectivo({ ambito, modo });
  const editable = ambito === "grupo" && efectivo === "build" && (rol === "CREADOR" || rol === "EDITOR");
  const reglas = [
    "## Capa 1 · Rol, ámbito y modo",
    `- Ámbito: ${ambito}.`,
    `- Modo efectivo: ${efectivo}.`,
    `- Rol de quien pregunta: ${rol ?? "desconocido"}.`,
    editable
      ? "- Puedes proponer ediciones: se aplican solo tras aprobación humana."
      : "- Solo lectura: no propongas ediciones del diagrama. Sí puedes usar las herramientas de lectura (getState, validate, consultarPlan, consultarHistorial) para responder con datos reales.",
    efectivo === "plan"
      ? "- En modo plan responde en markdown con un plan; no edites el diagrama."
      : "- En modo build respeta el plan vigente y las reglas del proyecto.",
    "- El modo y el ámbito los cambia una persona en la interfaz. No los cambies ni los pidas.",
  ];
  return { texto: `${SYSTEM_PROMPT}\n\n${reglas.join("\n")}`, recortada: false };
}

function renderSnapshot(snapshot: DiagramState | undefined, limite: number): Render {
  const cabecera =
    "## Capa 2 · Estado actual del diagrama\n" +
    "Esta es la única fuente de verdad del contenido actual; el historial sirve para entender referencias, no para suponer clases o relaciones.\n";
  if (!snapshot || (snapshot.classes.length === 0 && snapshot.links.length === 0)) {
    return { texto: `${cabecera}El diagrama está vacío.`, recortada: false };
  }

  const completo = `${cabecera}${JSON.stringify(snapshot)}`;
  if (estimateTokens(completo) <= limite) return { texto: completo, recortada: false };

  // D45: antes de perder clases o relaciones se omiten miembros.
  const compacto = {
    classes: snapshot.classes.map((clase) => ({
      key: clase.key,
      name: clase.name,
      category: clase.category,
      ...(clase.isAbstract ? { isAbstract: true } : {}),
    })),
    links: snapshot.links,
  };
  const textoCompacto = `${cabecera}${JSON.stringify(compacto)}\n[miembros omitidos por presupuesto]`;
  if (estimateTokens(textoCompacto) <= limite) {
    return { texto: textoCompacto, recortada: true };
  }
  return recortarTexto(textoCompacto, limite);
}

function renderColaboradores(colaboradores: ColaboradorContexto[] | undefined, limite: number): Render {
  const cabecera = "## Capa 3 · Colaboradores del proyecto\n";
  if (!colaboradores || colaboradores.length === 0) {
    return { texto: `${cabecera}No hay colaboradores registrados.`, recortada: false };
  }
  const lineas = colaboradores.map(
    (persona) => `- ${persona.nombre}${persona.username ? ` (@${persona.username})` : ""} · ${persona.rol}`,
  );
  return renderLineas(cabecera, lineas, limite);
}

function renderActividad(eventos: EventoContexto[] | undefined, limite: number): Render {
  const cabecera = "## Capa 4 · Actividad reciente\n";
  if (!eventos || eventos.length === 0) {
    return { texto: `${cabecera}Sin actividad registrada.`, recortada: false };
  }
  const lineas = eventos.map(
    (evento) =>
      `- ${fechaCorta(evento.creadoEn)} · ${evento.actorNombre} (${evento.actorTipo}) · ${evento.tipo}: ${evento.resumen}`,
  );
  return renderLineas(cabecera, lineas, limite);
}

function renderLineas(cabecera: string, lineas: string[], limite: number): Render {
  if (limite <= 0) return { texto: "", recortada: lineas.length > 0 };
  const usadas: string[] = [];
  let tokens = estimateTokens(cabecera);
  for (const linea of lineas) {
    const costo = estimateTokens(linea) + 4;
    if (tokens + costo > limite) break;
    usadas.push(linea);
    tokens += costo;
  }
  if (usadas.length === 0) {
    return recortarTexto(cabecera, limite);
  }
  return { texto: cabecera + usadas.join("\n"), recortada: usadas.length < lineas.length };
}

function renderResumen(
  resumen: ResumenContexto | null | undefined,
  ambito: AmbitoIA,
  limite: number,
): Render {
  const cabecera = "## Capa 5 · Conversación previa\n";
  if (ambito === "privado") {
    return {
      texto: `${cabecera}Ámbito privado: no se lee ni se comparte el resumen ni la conversación del grupo.`,
      recortada: false,
    };
  }
  if (!resumen || resumen.texto.trim() === "") {
    return {
      texto: `${cabecera}La sala no tiene resumen vigente; usa el historial reciente.`,
      recortada: false,
    };
  }
  const prefijo = `${cabecera}Resumen de la sala hasta ${fechaCorta(resumen.hastaCreadoEn)}:\n`;
  const cuerpo = resumen.texto.trim();
  const disponible = Math.max(0, limite - estimateTokens(prefijo));
  const cuerpoRecortado = recortarTexto(cuerpo, disponible);
  return {
    texto: prefijo + cuerpoRecortado.texto,
    recortada: cuerpoRecortado.recortada,
  };
}

function renderPlan(plan: PlanContexto | null | undefined, modo: ModoIA, limite: number): Render {
  const cabecera = "## Capa 6 · Plan vigente del proyecto\n";
  if (!plan) {
    return {
      texto: `${cabecera}No hay un plan guardado. No inventes un acuerdo anterior; si hace falta, propone uno.`,
      recortada: false,
    };
  }
  const prefijo =
    `${cabecera}Versión ${plan.version} · ${plan.autorNombre} · ${fechaCorta(plan.creadoEn)} · origen ${plan.origen}\n` +
    (modo === "build"
      ? "Es el acuerdo que debes respetar al editar; si el pedido lo contradice, señálalo antes de proponer cambios.\n"
      : "Es el punto de partida del proyecto; úsalo para redactar el plan.\n");
  const disponible = Math.max(0, limite - estimateTokens(prefijo));
  const cuerpo = recortarTexto(plan.contenido, disponible);
  return { texto: prefijo + cuerpo.texto, recortada: cuerpo.recortada };
}

/**
 * Construye el historial a partir de los mensajes crudos.
 *
 * - excluye lo que el resumen ya cubre (por `creadoEn`);
 * - agrupa por turnos para no dejar un `user` sin su `assistant` ni viceversa;
 * - conserva el bloque más reciente aunque no quepa en el presupuesto.
 */
function construirHistorial(
  mensajes: MensajeContexto[] | undefined,
  resumen: ResumenContexto | null | undefined,
  limite: number,
): { history: IAChatMessage[]; recortada: boolean } {
  if (!mensajes || mensajes.length === 0) return { history: [], recortada: false };

  const corte = resumen?.hastaCreadoEn ? new Date(resumen.hastaCreadoEn).getTime() : null;
  const utiles = mensajes.filter((mensaje) => {
    if (!mensaje.content || mensaje.content.trim() === "") return false;
    if (corte === null || !mensaje.creadoEn) return true;
    const fecha = new Date(mensaje.creadoEn).getTime();
    return !Number.isNaN(fecha) && fecha > corte;
  });
  if (utiles.length === 0) return { history: [], recortada: false };

  const bloques = agruparEnBloques(
    utiles.map((mensaje) => ({ role: mensaje.role, content: mensaje.content })),
  );
  let recortada = false;
  while (bloques.length > 1 && estimateMessagesTokens(bloques.flat()) > limite) {
    bloques.shift();
    recortada = true;
  }
  if (limite <= 0) {
    return { history: [], recortada: bloques.length > 0 };
  }
  const history = recortarHastaPrimerUsuario(bloques.flat());
  if (estimateMessagesTokens(history) > limite) recortada = true;
  return { history, recortada };
}

export function armarContexto({
  fuentes,
  snapshot,
  ambito,
  modo,
  rol,
  perfil,
  tools,
  mensajeActual,
}: ArmarContextoParams): ContextoArmado {
  const efectivo = modoEfectivo({ ambito, modo });
  const presupuesto = calcularPresupuesto(perfil, tools, "");
  const reservaMensaje = estimateTokens(mensajeActual) + 4;
  let presupuestoSistema = Math.max(0, presupuesto.entrada - presupuesto.herramientas - reservaMensaje);

  const estado = new Map<IdCapa, { texto: string; recortada: boolean; limite: number }>();
  const guardar = (id: IdCapa, render: Render, limite: number) =>
    estado.set(id, { texto: render.texto, recortada: render.recortada, limite });

  guardar(1, renderRolYModo(ambito, efectivo, rol), capaPorId(1).tope);
  guardar(2, renderSnapshot(snapshot, capaPorId(2).tope), capaPorId(2).tope);
  guardar(3, renderColaboradores(fuentes.colaboradores, capaPorId(3).tope), capaPorId(3).tope);
  guardar(4, renderActividad(fuentes.actividad, capaPorId(4).tope), capaPorId(4).tope);
  guardar(5, renderResumen(fuentes.resumen, ambito, capaPorId(5).tope), capaPorId(5).tope);
  guardar(6, renderPlan(fuentes.plan, efectivo, capaPorId(6).tope), capaPorId(6).tope);

  const tokensSistema = () =>
    [...estado.entries()]
      .filter(([id]) => id !== 5)
      .reduce((total, [, capa]) => total + estimateTokens(capa.texto), 0) +
    estimateTokens(estado.get(5)?.texto ?? "");

  // La capa 5 también incluye el historial, pero el reparto se hace sobre el
  // texto del resumen; el historial recibe lo que sobre.
  let totalSistema = tokensSistema();

  for (const id of ORDEN_RECORTE) {
    if (totalSistema <= presupuestoSistema) break;
    const actual = estado.get(id);
    if (!actual) continue;
    const exceso = totalSistema - presupuestoSistema;
    const nuevoLimite = Math.max(0, estimateTokens(actual.texto) - exceso - 8);
    let reemplazo: Render;
    if (nuevoLimite <= 20) {
      reemplazo = { texto: "", recortada: true };
    } else {
      switch (id) {
        case 2:
          reemplazo = renderSnapshot(snapshot, nuevoLimite);
          break;
        case 3:
          reemplazo = renderColaboradores(fuentes.colaboradores, nuevoLimite);
          break;
        case 4:
          reemplazo = renderActividad(fuentes.actividad, nuevoLimite);
          break;
        case 5:
          reemplazo = renderResumen(fuentes.resumen, ambito, nuevoLimite);
          break;
        case 6:
          reemplazo = renderPlan(fuentes.plan, efectivo, nuevoLimite);
          break;
        default:
          reemplazo = actual;
      }
    }
    estado.set(id, { texto: reemplazo.texto, recortada: actual.recortada || reemplazo.recortada, limite: nuevoLimite });
    totalSistema = tokensSistema();
  }

  // Si aun así no cabe (diagrama enorme), se trunca el snapshot; el mensaje
  // actual y la capa 1 ya están reservados y no se tocan.
  if (totalSistema > presupuestoSistema) {
    const actual = estado.get(2);
    if (actual) {
      const exceso = totalSistema - presupuestoSistema;
      const limite = Math.max(0, estimateTokens(actual.texto) - exceso - 8);
      const reemplazo = renderSnapshot(snapshot, limite);
      estado.set(2, { texto: reemplazo.texto, recortada: true, limite });
      totalSistema = tokensSistema();
    }
  }

  const limiteHistorial = Math.max(0, presupuestoSistema - totalSistema);
  // D52: en privado el resumen es memoria del grupo y no puede filtrar ni
  // recortar el historial local que aporta el llamador.
  const historial = construirHistorial(
    fuentes.mensajes,
    ambito === "privado" ? null : fuentes.resumen,
    limiteHistorial,
  );

  const capas: CapaContexto[] = CAPAS.map((definicion) => {
    const capa = estado.get(definicion.id) ?? { texto: "", recortada: false, limite: 0 };
    const tokens =
      definicion.id === 5
        ? estimateTokens(capa.texto) + estimateMessagesTokens(historial.history)
        : estimateTokens(capa.texto);
    return {
      id: definicion.id,
      nombre: definicion.nombre,
      tokens,
      recortada:
        definicion.id === 5 ? capa.recortada || historial.recortada : capa.recortada,
    };
  });

  const systemPrompt = CAPAS.map((definicion) => estado.get(definicion.id)?.texto ?? "")
    .filter((texto) => texto.trim() !== "")
    .join("\n\n");

  const degradado = [...(fuentes.degradado ?? [])];
  logContextoCapas(capas, degradado, presupuesto.entrada);

  return { systemPrompt, history: historial.history, capas, degradado };
}

/** Diagnóstico por capa cuando `IA_DEBUG_CONTEXT=1`. */
export function logContextoCapas(
  capas: CapaContexto[],
  degradado: string[],
  presupuestoEntrada: number,
): void {
  if (process.env.IA_DEBUG_CONTEXT !== "1") return;
  const total = capas.reduce((suma, capa) => suma + capa.tokens, 0);
  console.log(`[ia:capas] tokens=${total}/${presupuestoEntrada} degradado=${degradado.join(",") || "ninguno"}`);
  for (const capa of capas) {
    console.log(
      `[ia:capas] ${capa.id}. ${capa.nombre}: ${capa.tokens} tok${capa.recortada ? " (recortada)" : ""}`,
    );
  }
}
