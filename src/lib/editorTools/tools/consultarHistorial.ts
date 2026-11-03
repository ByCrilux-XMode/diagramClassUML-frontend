import { listarEventos } from "@/lib/actividad/api";
import type { EventoApi } from "@/lib/actividad/api";
import type { ToolContext, ToolResult, ValidationResult } from "../define";
import { fail, isObject } from "../define";
import type { ToolDef } from "../define";

/**
 * Consulta compacta de la bitácora.
 *
 * El detalle completo (`cambios[]`) se queda en el panel de actividad: enviarlo
 * al modelo infla la ventana sin aportar a la pregunta típica (“quién”, “cuándo”,
 * “qué pasó”). Lo que sí viaja es el resumen que ya calculó el registro.
 */

export interface ConsultarHistorialArgs {
  entidad?: string;
  actor?: string;
  actorTipo?: "humano" | "ia" | "sistema";
  tipo?: string;
  desde?: string;
  hasta?: string;
  limite?: number;
}

export const LIMITE_HISTORIAL_DEFECTO = 20;
export const LIMITE_HISTORIAL_MAX = 50;

const TIPOS_ACTOR = ["humano", "ia", "sistema"] as const;

function fechaValida(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim() !== "" && !Number.isNaN(new Date(valor).getTime());
}

function textoOpcional(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : undefined;
}

export const consultarHistorialTool = {
  name: "consultarHistorial",
  description:
    "Consulta la bitácora del proyecto por entidad, actor, tipo de actor, tipo de evento o rango de fechas. Devuelve eventos compactos (fecha, actor, tipo, resumen y entidades) sin el detalle de los cambios. Úsala para responder quién hizo qué y cuándo; exige al menos un filtro.",
  readOnly: true,
  requiresDiagram: false,
  parameters: {
    type: "object",
    properties: {
      entidad: {
        type: "string",
        description: "Clave de la entidad afectada, por ejemplo 'pedido' o 'pedido_usuario'.",
      },
      actor: {
        type: "string",
        description: "Nombre de la persona o de la IA tal como aparece en la bitácora.",
      },
      actorTipo: {
        type: "string",
        enum: ["humano", "ia", "sistema"],
        description: "Tipo de actor que realizó el cambio.",
      },
      tipo: {
        type: "string",
        description: "Tipo de evento, por ejemplo 'clase.eliminar' o 'relacion.crear'.",
      },
      desde: { type: "string", description: "Fecha ISO 8601 inicial (inclusive)." },
      hasta: { type: "string", description: "Fecha ISO 8601 final (inclusive)." },
      limite: {
        type: "number",
        description: `Máximo de eventos a devolver (1..${LIMITE_HISTORIAL_MAX}). Por defecto ${LIMITE_HISTORIAL_DEFECTO}.`,
      },
    },
  },

  validate(raw: unknown): ValidationResult<ConsultarHistorialArgs> {
    if (!isObject(raw)) return fail("Los argumentos deben ser un objeto.");

    const entidad = textoOpcional(raw.entidad);
    const actor = textoOpcional(raw.actor);
    const tipo = textoOpcional(raw.tipo);
    const actorTipo =
      typeof raw.actorTipo === "string" &&
      (TIPOS_ACTOR as readonly string[]).includes(raw.actorTipo)
        ? (raw.actorTipo as ConsultarHistorialArgs["actorTipo"])
        : undefined;
    if (raw.actorTipo !== undefined && !actorTipo) {
      return fail("actorTipo debe ser 'humano', 'ia' o 'sistema'.");
    }

    if (raw.desde !== undefined && !fechaValida(raw.desde)) {
      return fail("desde debe ser una fecha ISO 8601 válida.");
    }
    if (raw.hasta !== undefined && !fechaValida(raw.hasta)) {
      return fail("hasta debe ser una fecha ISO 8601 válida.");
    }
    const desde = textoOpcional(raw.desde);
    const hasta = textoOpcional(raw.hasta);
    if (desde && hasta && new Date(desde).getTime() > new Date(hasta).getTime()) {
      return fail("desde no puede ser posterior a hasta.");
    }

    if (!entidad && !actor && !actorTipo && !tipo && !desde && !hasta) {
      return fail(
        "Indica al menos un filtro (entidad, actor, actorTipo, tipo, desde o hasta) para acotar la consulta.",
      );
    }

    let limite = LIMITE_HISTORIAL_DEFECTO;
    if (raw.limite !== undefined) {
      if (typeof raw.limite !== "number" || !Number.isInteger(raw.limite)) {
        return fail("limite debe ser un número entero.");
      }
      limite = Math.min(Math.max(raw.limite, 1), LIMITE_HISTORIAL_MAX);
    }

    return {
      ok: true,
      value: { entidad, actor, actorTipo, tipo, desde, hasta, limite },
    };
  },

  async execute(args: ConsultarHistorialArgs, ctx: ToolContext): Promise<ToolResult> {
    if (ctx.proyectoId === null || ctx.proyectoId === undefined) {
      return fail("No hay proyecto activo: la bitácora solo se consulta dentro de un proyecto.");
    }

    try {
      const { datos } = await listarEventos(ctx.proyectoId, {
        entidad: args.entidad,
        actorNombre: args.actor,
        actorTipo: args.actorTipo,
        tipo: args.tipo,
        desde: args.desde,
        hasta: args.hasta,
        limite: args.limite ?? LIMITE_HISTORIAL_DEFECTO,
      });

      const eventos = datos.map((evento: EventoApi) => ({
        fecha: evento.creadoEn,
        actor: evento.actorNombre,
        actorTipo: evento.actorTipo,
        tipo: evento.tipo,
        resumen: evento.resumen,
        entidades: evento.entidades,
        turnoId: evento.turnoId ?? null,
      }));

      return {
        ok: true,
        message:
          eventos.length === 0
            ? "No constan eventos en la bitácora para esos filtros."
            : `${eventos.length} evento(s) encontrados en la bitácora.`,
        data: { eventos },
      };
    } catch (err: unknown) {
      return fail(`No se pudo consultar la bitácora: ${mensajeDeError(err)}`);
    }
  },
} satisfies ToolDef<ConsultarHistorialArgs, "consultarHistorial">;

function mensajeDeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "response" in err) {
    const response = (err as { response?: { status?: number; data?: { message?: unknown } } }).response;
    const mensaje = response?.data?.message;
    if (typeof mensaje === "string") return mensaje;
    if (response?.status) return `el servidor respondió HTTP ${response.status}`;
  }
  return err instanceof Error ? err.message : String(err);
}
