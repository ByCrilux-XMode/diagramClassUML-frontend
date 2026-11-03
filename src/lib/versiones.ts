import api from "./api";
import type { Proyecto } from "@/types/proyecto";
import type { VersionProyecto } from "@/types/version";

export async function listarVersiones(
  proyectoId: string | number
): Promise<VersionProyecto[]> {
  const { data } = await api.get<VersionProyecto[]>(
    `/proyectos/${proyectoId}/versiones`
  );
  return data;
}

export async function crearVersion(
  proyectoId: string | number,
  nombre: string
): Promise<VersionProyecto> {
  const { data } = await api.post<VersionProyecto>(
    `/proyectos/${proyectoId}/versiones`,
    { nombre }
  );
  return data;
}

export async function actualizarVersion(
  proyectoId: string | number,
  versionId: number,
  payload: { nombre?: string; actualizarSnapshot?: boolean }
): Promise<VersionProyecto> {
  const { data } = await api.patch<VersionProyecto>(
    `/proyectos/${proyectoId}/versiones/${versionId}`,
    payload
  );
  return data;
}

export async function eliminarVersion(
  proyectoId: string | number,
  versionId: number
): Promise<void> {
  await api.delete(`/proyectos/${proyectoId}/versiones/${versionId}`);
}

export async function restaurarVersion(
  proyectoId: string | number,
  versionId: number
): Promise<Proyecto> {
  const { data } = await api.post<Proyecto>(
    `/proyectos/${proyectoId}/versiones/${versionId}/restaurar`
  );
  return data;
}
