import api from "@/lib/api";

export type OrigenPlan = "humano" | "ia";

export interface Plan {
  _id: string;
  proyectoId: number;
  version: number;
  contenido: string;
  autorUsuarioId: number;
  autorNombre: string;
  origen: OrigenPlan;
  sustituyeA: number | null;
  creadoEn: string;
}

export interface ListadoPlanes {
  planes: Plan[];
  vigente: Plan | null;
}

/** Crea una versión nueva del plan. Requiere rol CREADOR o EDITOR. */
export async function guardarPlan(
  proyectoId: string | number,
  input: { contenido: string; origen: OrigenPlan },
): Promise<Plan> {
  const { data } = await api.post<{ plan: Plan }>(`/proyectos/${proyectoId}/planes`, input);
  return data.plan;
}

/** Devuelve la versión vigente y las más recientes. */
export async function listarPlanes(
  proyectoId: string | number,
  limite = 10,
): Promise<ListadoPlanes> {
  const { data } = await api.get<ListadoPlanes>(`/proyectos/${proyectoId}/planes`, {
    params: { limite },
  });
  return data;
}

/** Devuelve una versión concreta del plan. */
export async function obtenerPlanVersion(
  proyectoId: string | number,
  version: number,
): Promise<Plan> {
  const { data } = await api.get<{ plan: Plan }>(`/proyectos/${proyectoId}/planes/${version}`);
  return data.plan;
}
