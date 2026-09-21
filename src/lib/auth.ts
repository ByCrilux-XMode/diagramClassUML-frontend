import api from "./api";
import type { AuthResponse, Credenciales, RegistroInput, Usuario } from "@/types/auth";

export async function iniciarSesion(
  credenciales: Credenciales
): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>(
    "/auth/iniciar-sesion",
    credenciales
  );
  return data;
}

export async function registrarse(
  input: RegistroInput
): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/registrarse", input);
  return data;
}

export async function cerrarSesion(): Promise<void> {
  await api.post("/auth/cerrar-sesion");
}

export async function obtenerUsuarioActual(): Promise<Usuario> {
  const { data } = await api.get<Usuario>("/usuarios/me");
  return data;
}
