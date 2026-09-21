"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAuthSplit } from "@/components/auth/AuthShell";
import InputFlat from "@/components/ui/InputFlat";

export default function LoginForm() {
  const { triggerSplit } = useAuthSplit();
  const { login, loading, error, clearError } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ok = await login({ username, password });
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

      <div>
        <label htmlFor="username" className="sr-only">
          Username
        </label>
        <InputFlat
          id="username"
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
        <label htmlFor="password" className="sr-only">
          Password
        </label>
        <InputFlat
          id="password"
          name="password"
          type="password"
          placeholder="Password"
          required
          autoComplete="current-password"
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
          {loading ? "Ingresando…" : "Entrar"}
          <ArrowRight className="h-4 w-4" />
        </button>

        <Link
          href="/registro"
          className="font-mono text-xs text-on-surface-variant transition-colors hover:text-primary"
        >
          Registrarse
        </Link>
      </div>
    </form>
  );
}
