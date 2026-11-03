import { listarPlanes, obtenerPlanVersion } from "@/lib/planes/api";
import type { Plan } from "@/lib/planes/api";
import type { ToolContext, ToolResult, ValidationResult } from "../define";
import { fail, isObject } from "../define";
import type { ToolDef } from "../define";

/**
 * Consulta del plan del proyecto.
 *
 * No reemplaza la capa 6 del contexto (el plan vigente viaja en cada turno):
 * sirve para leer una versión anterior concreta o el texto completo cuando la
 * capa se truncó por presupuesto. Sin `version` devuelve la vigente.
 */

export interface ConsultarPlanArgs {
  version?: number;
}

/** Tope de texto que se devuelve al modelo, en caracteres (~1.500 tokens). */
export const MAX_CARACTERES_PLAN = 5_200;
export const MARCA_PLAN_TRUNCADO = "\n[…plan truncado; consulta una versión concreta si necesitas el resto]";

function recortarPlan(plan: Plan): { contenido: string; truncado: boolean } {
  if (plan.contenido.length <= MAX_CARACTERES_PLAN) {
    return { contenido: plan.contenido, truncado: false };
  }
  return {
    contenido: plan.contenido.slice(0, MAX_CARACTERES_PLAN) + MARCA_PLAN_TRUNCADO,
    truncado: true,
  };
}

function formatear(plan: Plan) {
  const { contenido, truncado } = recortarPlan(plan);
  return {
    version: plan.version,
    contenido,
    truncado,
    autor: plan.autorNombre,
    origen: plan.origen,
    sustituyeA: plan.sustituyeA,
    creadoEn: plan.creadoEn,
  };
}

export const consultarPlanTool = {
  name: "consultarPlan",
  description:
    "Consulta el plan acordado del proyecto: sin argumentos devuelve la versión vigente; con `version` devuelve esa versión concreta. Devuelve versión, contenido, autor, origen y fecha. La versión vigente ya viene en el contexto; usa esta herramienta para versiones anteriores o para leer el texto completo.",
  readOnly: true,
  requiresDiagram: false,
  parameters: {
    type: "object",
    properties: {
      version: {
        type: "number",
        description: "Número de versión del plan. Si se omite, devuelve la versión vigente.",
      },
    },
  },

  validate(raw: unknown): ValidationResult<ConsultarPlanArgs> {
    if (!isObject(raw)) return fail("Los argumentos deben ser un objeto.");

    if (raw.version === undefined || raw.version === null) {
      return { ok: true, value: {} };
    }
    if (
      typeof raw.version !== "number" ||
      !Number.isInteger(raw.version) ||
      raw.version < 1
    ) {
      return fail("version debe ser un número entero mayor o igual a 1.");
    }
    return { ok: true, value: { version: raw.version } };
  },

  async execute(args: ConsultarPlanArgs, ctx: ToolContext): Promise<ToolResult> {
    if (ctx.proyectoId === null || ctx.proyectoId === undefined) {
      return fail("No hay proyecto activo: el plan solo se consulta dentro de un proyecto.");
    }

    try {
      if (args.version !== undefined) {
        const plan = await obtenerPlanVersion(ctx.proyectoId, args.version);
        return {
          ok: true,
          message: `Plan versión ${plan.version} de ${plan.autorNombre}.`,
          data: { plan: formatear(plan) },
        };
      }

      const { vigente } = await listarPlanes(ctx.proyectoId, 1);
      if (!vigente) {
        return {
          ok: true,
          message: "El proyecto no tiene un plan guardado.",
          data: { plan: null },
        };
      }
      return {
        ok: true,
        message: `Plan vigente: versión ${vigente.version} de ${vigente.autorNombre}.`,
        data: { plan: formatear(vigente) },
      };
    } catch (err: unknown) {
      return fail(`No se pudo consultar el plan: ${mensajeDeError(err)}`);
    }
  },
} satisfies ToolDef<ConsultarPlanArgs, "consultarPlan">;

function mensajeDeError(err: unknown): string {
  if (typeof err === "object" && err !== null && "response" in err) {
    const response = (err as { response?: { status?: number; data?: { message?: unknown } } }).response;
    const mensaje = response?.data?.message;
    if (typeof mensaje === "string") return mensaje;
    if (response?.status === 404) return "la versión del plan no existe";
    if (response?.status) return `el servidor respondió HTTP ${response.status}`;
  }
  return err instanceof Error ? err.message : String(err);
}
