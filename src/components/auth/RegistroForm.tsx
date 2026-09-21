"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAuthSplit } from "@/components/auth/AuthShell";
import InputFlat from "@/components/ui/InputFlat";

export default function RegistroForm() {
  const { triggerSplit } = useAuthSplit();
  const { register, loading, error, clearError } = useAuth();
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = await register({ nombre, apellido, username, password });
    if (ok) {
      triggerSplit();
    }
  }

  return (
    <form className="w-full space-y-gutter" onSubmit={handleSubmit}>
      {error && (
        <p className="font-mono text-xs text-error" role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-gutter">
        <div>
          <label htmlFor="nombre" className="sr-only">
            Nombre
          </label>
          <InputFlat
            id="nombre"
            name="nombre"
            type="text"
            placeholder="Nombre"
            required
            autoComplete="given-name"
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              clearError();
            }}
          />
        </div>
        <div>
          <label htmlFor="apellido" className="sr-only">
            Apellido
          </label>
          <InputFlat
            id="apellido"
            name="apellido"
            type="text"
            placeholder="Apellido"
            required
            autoComplete="family-name"
            value={apellido}
            onChange={(e) => {
              setApellido(e.target.value);
              clearError();
            }}
          />
        </div>
      </div>

      <div>
        <label htmlFor="reg-username" className="sr-only">
          Username
        </label>
        <InputFlat
          id="reg-username"
          name="username"
          type="text"
          placeholder="Username"
          required
          autoComplete="username"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            clearError();
          }}
        />
      </div>

      <div>
        <label htmlFor="reg-password" className="sr-only">
          Password
        </label>
        <InputFlat
          id="reg-password"
          name="password"
          type="password"
          placeholder="Password (mínimo 8 caracteres)"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clearError();
          }}
        />
      </div>

      <div className="flex items-center justify-between pt-unit">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 border border-primary px-6 py-2 font-medium text-primary transition-colors duration-200 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Creando cuenta…" : "Crear cuenta"}
          <ArrowRight className="h-4 w-4" />
        </button>

        <Link
          href="/login"
          className="font-mono text-xs text-on-surface-variant transition-colors hover:text-primary"
        >
          ¿Ya tienes cuenta? Inicia sesión
        </Link>
      </div>
    </form>
  );
}