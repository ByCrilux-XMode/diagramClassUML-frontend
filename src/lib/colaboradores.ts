import api from "./api";
import type { Usuario } from "@/types/auth";
import type { Colaborador, Permiso } from "@/types/proyecto";

export async function buscarUsuarioPorUsername(
  username: string
): Promise<Usuario> {
  const { data } = await api.get<Usuario>(
    `/usuarios/username/${encodeURIComponent(username)}`
  );
  return data;
}

export async function listarColaboradores(
  proyectoId: string | number
): Promise<Colaborador[]> {
  const { data } = await api.get<Colaborador[]>(
    `/proyectos/${proyectoId}/colaboradores`
  );
  return data;
}

export async function agregarColaborador(
  proyectoId: string | number,
  payload: { usuarioId: number; permisoId: number }
): Promise<Colaborador> {
  const { data } = await api.post<Colaborador>(
    `/proyectos/${proyectoId}/colaboradores`,
    payload
  );
  return data;
}

export async function actualizarPermisoColaborador(
  proyectoId: string | number,
  usuarioId: number,
  permisoId: number
): Promise<Colaborador> {
  const { data } = await api.patch<Colaborador>(
    `/proyectos/${proyectoId}/colaboradores/${usuarioId}`,
    { permisoId }
  );
  return data;
}

export async function eliminarColaborador(
  proyectoId: string | number,
  usuarioId: number
): Promise<void> {
  await api.delete(`/proyectos/${proyectoId}/colaboradores/${usuarioId}`);
}

export async function listarPermisos(): Promise<Permiso[]> {
  const { data } = await api.get<Permiso[]>("/permisos");
  return data;
}