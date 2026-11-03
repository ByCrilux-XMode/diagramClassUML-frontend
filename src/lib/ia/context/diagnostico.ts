import type { ContextoInfo } from "../types";
import type { Plan } from "@/lib/planes/api";

/**
 * Formato del diagnóstico de contexto que se muestra bajo cada respuesta.
 * Vive fuera del componente para poder probarlo sin montar React.
 */
export interface DiagnosticoContexto {
  texto: string;
  titulo: string;
  degradado: boolean;
}

export function formatearContexto(contexto: ContextoInfo): DiagnosticoContexto {
  const capas = contexto.capas ?? [];
  const degradado = contexto.degradado ?? [];
  const titulo = [
    `Tokens estimados: ${contexto.tokensEstimados}/${contexto.presupuestoEntrada}`,
    `ventana ${contexto.ventana}`,
    ...capas.map(
      (capa) =>
        `Capa ${capa.id} · ${capa.nombre}: ${capa.tokens} tok${capa.recortada ? " (recortada)" : ""}`,
    ),
    ...(degradado.length ? [`Sin cargar: ${degradado.join(", ")}`] : []),
    ...(contexto.aviso ? [contexto.aviso] : []),
  ].join(" · ");

  const partes = [`contexto: ${contexto.tokensEstimados} tok`];
  if (contexto.bloquesEliminados > 0) partes.push(`${contexto.bloquesEliminados} bloque(s) fuera`);
  if (contexto.truncados > 0) partes.push(`${contexto.truncados} recortado(s)`);
  if (capas.length > 0) partes.push(`${capas.length} capas`);
  if (degradado.length > 0) partes.push(`degradado: ${degradado.join(", ")}`);

  return {
    texto: partes.join(" · "),
    titulo,
    degradado: degradado.length > 0,
  };
}

export function formatearPlanVigente(plan: Plan | null): string {
  if (!plan) return "Sin plan guardado: pídele a la IA un plan y guárdalo para fijar el acuerdo.";
  const fecha = new Date(plan.creadoEn);
  const dia = Number.isNaN(fecha.getTime())
    ? "sin fecha"
    : fecha.toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" });
  return `Plan vigente: v${plan.version} · ${plan.autorNombre} · ${dia}`;
}
