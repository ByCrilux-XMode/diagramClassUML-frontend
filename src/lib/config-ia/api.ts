import api from "@/lib/api";
import type { TareaIA, TramoProveedor } from "@/lib/ia/router";

/**
 * Configuración de proveedores del proyecto (fase 8).
 *
 * Las cadenas las decide el proyecto; el selector del panel solo fija el primer
 * tramo del turno (D59). Este documento no contiene secretos: las claves viven
 * en el `.env` del servidor.
 */
export interface ConfigIaApi {
  proyectoId: number;
  proveedor: TramoProveedor["proveedor"];
  modelo: string | null;
  cadenas: Record<TareaIA, TramoProveedor[]>;
  actualizadoPor: { usuarioId: number; nombre: string } | null;
  actualizadoEn: string | null;
  /** `true` si el proyecto no tiene documento y se devolvieron los defaults. */
  porDefecto: boolean;
}

export interface ActualizarConfigIaInput {
  proveedor?: TramoProveedor["proveedor"];
  modelo?: string | null;
  cadenas?: Partial<Record<TareaIA, TramoProveedor[]>>;
}

/** Cualquier colaborador, incluido LECTOR, puede leerla. */
export async function obtenerConfigIa(proyectoId: string | number): Promise<ConfigIaApi> {
  const { data } = await api.get<{ config: ConfigIaApi }>(`/proyectos/${proyectoId}/config-ia`);
  return data.config;
}

/** Solo el CREADOR del proyecto puede cambiarla. */
export async function actualizarConfigIa(
  proyectoId: string | number,
  input: ActualizarConfigIaInput,
): Promise<ConfigIaApi> {
  const { data } = await api.patch<{ config: ConfigIaApi }>(
    `/proyectos/${proyectoId}/config-ia`,
    input,
  );
  return data.config;
}
