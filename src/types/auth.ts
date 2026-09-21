export interface Persona {
  personaId: number;
  nombre: string;
  apellido: string;
}

export interface Usuario {
  usuarioId: number;
  username: string;
  persona: Persona;
  personaId: number;
}

export interface Credenciales {
  username: string;
  password: string;
}

export interface RegistroInput {
  username: string;
  password: string;
  nombre: string;
  apellido: string;
}

export interface AuthResponse {
  usuario: Usuario;
}
