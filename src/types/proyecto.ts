import type { Persona } from "./auth";

export interface UsuarioProyecto {
  usuarioId: number;
  username: string;
  persona: Persona;
  personaId: number;
}

export interface Proyecto {
  proyectoId: number;
  nombre: string;
  esquemaJson: Record<string, unknown> | null;
  creador: UsuarioProyecto;
  creadorId: number;
}

export interface ListaProyectosResponse {
  datos: Proyecto[];
  total: number;
}

export type RolProyecto = "CREADOR" | "EDITOR" | "LECTOR";

export interface ProyectoResumen {
  proyectoId: number;
  nombre: string;
  rol: RolProyecto;
}

export interface ListaProyectosResumenResponse {
  datos: ProyectoResumen[];
  total: number;
}

export interface Permiso {
  permisoId: number;
  nombre: string;
}

export interface Colaborador {
  usuarioId: number;
  proyectoId: number;
  permisoId: number;
  permiso: Permiso;
  usuario: UsuarioProyecto;
}

export interface CreadorVersion {
  usuarioId: number;
  username: string;
  persona: Persona;
}

export interface VersionProyecto {
  versionId: number;
  nombre: string;
  descripcion?: string | null;
  esquemaJson: Record<string, unknown> | null;
  creadaEn: string;
  proyectoId: number;
  creadoPorId: number | null;
  creadoPor: CreadorVersion | null;
}

export interface ListaVersionesResponse {
  datos: VersionProyecto[];
  total: number;
}