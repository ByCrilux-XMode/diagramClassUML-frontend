import api from "./api";
import type {
  ListaVersionesResponse,
  Proyecto,
  VersionProyecto,
} from "@/types/proyecto";

/**
 * 5.7 GET /proyectos/:id/versiones
 * Lista las versiones del proyecto, de la más reciente a la más antigua.
 */
export async function listarVersiones(
  proyectoId: string | number,
  pagina = 1,
  limite = 10
): Promise<ListaVersionesResponse> {
  const { data } = await api.get<ListaVersionesResponse>(
    `/proyectos/${proyectoId}/versiones`,
    { params: { pagina, limite } }
  );
  return data;
}

/**
 * 5.8 GET /proyectos/:id/versiones/:versionId
 * Obtiene una versión concreta con su esquema completo.
 */
export async function obtenerVersion(
  proyectoId: string | number,
  versionId: string | number
): Promise<VersionProyecto> {
  const { data } = await api.get<VersionProyecto>(
    `/proyectos/${proyectoId}/versiones/${versionId}`
  );
  return data;
}

/**
 * 5.9 POST /proyectos/:id/versiones
 * Crea una versión manual con el esquema actual del proyecto.
 * Si no se envía nombre, el backend usa "Versión N".
 */
export async function crearVersion(
  proyectoId: string | number,
  payload: { nombre?: string; descripcion?: string } = {}
): Promise<VersionProyecto> {
  const body: { nombre?: string; descripcion?: string } = {};
  const nombre = payload.nombre?.trim();
  const descripcion = payload.descripcion?.trim();
  if (nombre) body.nombre = nombre;
  if (descripcion) body.descripcion = descripcion;

  const { data } = await api.post<VersionProyecto>(
    `/proyectos/${proyectoId}/versiones`,
    body
  );
  return data;
}

/**
 * 5.10 POST /proyectos/:id/versiones/:versionId/restaurar
 * Restaura el esquema de una versión y devuelve el proyecto actualizado.
 */
export async function restaurarVersion(
  proyectoId: string | number,
  versionId: string | number
): Promise<Proyecto> {
  const { data } = await api.post<Proyecto>(
    `/proyectos/${proyectoId}/versiones/${versionId}/restaurar`
  );
  return data;
}

/**
 * DELETE /proyectos/:id/versiones/:versionId
 * Elimina una versión del historial. No modifica el esquema actual del proyecto.
 * Responde 204 sin contenido.
 */
export async function eliminarVersion(
  proyectoId: string | number,
  versionId: string | number
): Promise<void> {
  await api.delete(`/proyectos/${proyectoId}/versiones/${versionId}`);
}
