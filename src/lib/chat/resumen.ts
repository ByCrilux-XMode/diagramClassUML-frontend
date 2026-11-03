import { actualizarResumen } from "@/lib/chat/api";
import type { MensajeChat, ResumenSalaChat } from "@/lib/chat/api";
import { IA_RESUMEN_CADA, IA_RESUMEN_MAX_MENSAJES, IA_RESUMEN_MODEL, IA_RESUMEN_PROVIDER } from "@/lib/ia/config";
import { chatConFallback } from "@/lib/ia/fallback";
import type { TramoProveedor } from "@/lib/ia/router";
import type { IAChatMessage, IAProvider } from "@/lib/ia/types";

/**
 * Resumen rodante de la sala (D50).
 *
 * El loop corre en el navegador y Nest no llama al modelo, así que el cliente
 * que termina el turno es quien resume. Es auxiliar: cualquier fallo se queda
 * en el diagnóstico local y el turno ya publicado no se toca.
 */

export interface ResultadoResumen {
  actualizado: boolean;
  motivo?: string;
  resumen?: string;
}

export function mensajesPendientes(
  mensajes: MensajeChat[],
  resumen: ResumenSalaChat | null | undefined,
): MensajeChat[] {
  const corte = resumen?.hastaCreadoEn ? new Date(resumen.hastaCreadoEn).getTime() : null;
  return mensajes.filter((mensaje) => {
    if (mensaje.tipo !== "texto") return false;
    if (!(mensaje.contenido ?? "").trim()) return false;
    if (corte === null) return true;
    const fecha = new Date(mensaje.creadoEn).getTime();
    return !Number.isNaN(fecha) && fecha > corte;
  });
}

export function debeResumir(pendientes: MensajeChat[], cada = IA_RESUMEN_CADA): boolean {
  return pendientes.length >= Math.max(1, cada);
}

export function armarPromptResumen(
  resumenAnterior: string | null | undefined,
  pendientes: MensajeChat[],
): IAChatMessage[] {
  const recortados = pendientes.slice(-Math.max(1, IA_RESUMEN_MAX_MENSAJES));
  const conversacion = recortados
    .map((mensaje) => `${mensaje.autorTipo === "ia" ? "IA" : mensaje.autorNombre}: ${mensaje.contenido ?? ""}`)
    .join("\n");

  return [
    {
      role: "system",
      content:
        "Resumes la conversación de un equipo que diseña diagramas UML con una IA. " +
        "Conserva acuerdos, pedidos pendientes, decisiones y quién hizo qué. " +
        "No inventes datos que no aparezcan en los mensajes. Devuelve solo el resumen, en español, en menos de 250 palabras.",
    },
    {
      role: "user",
      content:
        (resumenAnterior?.trim()
          ? `Resumen anterior:\n${resumenAnterior.trim()}\n\n`
          : "No hay resumen anterior.\n\n") +
        `Mensajes nuevos:\n${conversacion}`,
    },
  ];
}

export interface ResumenGenerado {
  texto: string;
  modelo: string;
}

export async function generarResumen(
  pendientes: MensajeChat[],
  resumenAnterior: string | null | undefined,
  opciones: { cadena?: TramoProveedor[]; provider?: IAProvider; model?: string } = {},
): Promise<ResumenGenerado> {
  const cadena: TramoProveedor[] =
    opciones.cadena && opciones.cadena.length > 0
      ? opciones.cadena
      : [
          {
            proveedor: opciones.provider ?? IA_RESUMEN_PROVIDER,
            modelo: opciones.model ?? IA_RESUMEN_MODEL,
          },
        ];
  const messages = armarPromptResumen(resumenAnterior, pendientes);
  const resultado = await chatConFallback({
    cadena,
    preparar: () => ({ messages, tools: [] }),
  });
  const texto = (resultado.content ?? "").trim();
  if (texto === "") throw new Error("El modelo de resumen no devolvió texto.");
  return { texto, modelo: resultado.modeloUsado };
}

/**
 * Punto de entrada best-effort: mide, genera y persiste si corresponde.
 * Nunca lanza; el llamador no debe esperar a que termine para publicar.
 */
export async function quizasResumirSala(input: {
  proyectoId: string | number;
  mensajes: MensajeChat[];
  resumen: ResumenSalaChat | null | undefined;
  cadena?: TramoProveedor[];
  provider?: IAProvider;
  model?: string;
}): Promise<ResultadoResumen> {
  const pendientes = mensajesPendientes(input.mensajes, input.resumen);
  if (!debeResumir(pendientes)) {
    return { actualizado: false, motivo: "umbral" };
  }

  const ultimo = pendientes[pendientes.length - 1];
  if (!ultimo) return { actualizado: false, motivo: "sin-mensajes" };

  try {
    const { texto, modelo } = await generarResumen(pendientes, input.resumen?.texto, {
      cadena: input.cadena,
      provider: input.provider,
      model: input.model,
    });
    const { actualizado } = await actualizarResumen(input.proyectoId, {
      texto,
      hastaMensajeId: ultimo._id,
      modelo,
    });
    return { actualizado, motivo: actualizado ? undefined : "no-avanza", resumen: texto };
  } catch (err: unknown) {
    return {
      actualizado: false,
      motivo: err instanceof Error ? err.message : String(err),
    };
  }
}
