import api from "./api";
import type {
  ListaProyectosResponse,
  ListaProyectosResumenResponse,
  Proyecto,
} from "@/types/proyecto";

export async function listarProyectos(
  pagina = 1,
  limite = 100
): Promise<ListaProyectosResponse> {
  const { data } = await api.get<ListaProyectosResponse>("/proyectos", {
    params: { pagina, limite },
  });
  return data;
}

export async function listarMisProyectos(
  pagina = 1,
  limite = 100
): Promise<ListaProyectosResumenResponse> {
  const { data } = await api.get<ListaProyectosResumenResponse>(
    "/usuarios/me/proyectos",
    { params: { pagina, limite } }
  );
  return data;
}

export async function crearProyecto(input: {
  nombre: string;
  esquemaJson?: Record<string, unknown> | null;
}): Promise<Proyecto> {
  const { data } = await api.post<Proyecto>("/proyectos", {
    nombre: input.nombre,
    esquemaJson: input.esquemaJson ?? null,
  });
  return data;
}

export async function obtenerProyecto(id: string | number): Promise<Proyecto> {
  const { data } = await api.get<Proyecto>(`/proyectos/${id}`);
  return data;
}

export async function actualizarProyecto(
  id: string | number,
  payload: { esquemaJson?: Record<string, unknown> | null, nombre?:string}
): Promise<Proyecto> {
  const body: {nombre?: string; esquemaJson?: Record<string, unknown>|null} = {};
  if (payload.nombre !== undefined){
    body.nombre = payload.nombre.trim();
  };
  if (payload.esquemaJson !== undefined){
    body.esquemaJson = payload.esquemaJson
  };
  const { data } = await api.patch<Proyecto>(`/proyectos/${id}`, body);
  return data;
}

export async function eliminarProyecto(id: number | string): Promise<void> {
  await api.delete(`/proyectos/${id}`);
}

export async function guardarColaboracion(id: number | string): Promise<Proyecto> {
  const { data } = await api.post<Proyecto>(`/proyectos/${id}/guardar-colaboracion`);
  return data;
}
