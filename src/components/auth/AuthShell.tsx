"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import PageLoader from "@/components/ui/PageLoader";

interface AuthSplitContextValue {
  triggerSplit: () => void;
}

const AuthSplitContext = createContext<AuthSplitContextValue | null>(null);

export function useAuthSplit() {
  const ctx = useContext(AuthSplitContext);
  if (!ctx) {
    throw new Error("useAuthSplit debe usarse dentro de <AuthShell>.");
  }
  return ctx;
}

interface AuthShellProps {
  children: React.ReactNode;
  brandTag: string;
}

export default function AuthShell({ children, brandTag }: AuthShellProps) {
  const router = useRouter();
  const [split, setSplit] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerSplit = useCallback(() => {
    if (split) return;
    setSplit(true);
    timerRef.current = setTimeout(() => {
      router.push("/proyectos");
      router.refresh();
    }, 750);
  }, [router, split]);

  const contextValue = useMemo(
    () => ({ triggerSplit }),
    [triggerSplit]
  );

  return (
    <AuthSplitContext.Provider value={contextValue}>
      <div className="relative min-h-screen overflow-hidden">
        {/* Capa revelada al dividir la pantalla (fondo oscuro blueprint) */}
        <div className="absolute inset-0 flex items-center justify-center">
          <PageLoader variant="dark" />
        </div>

        {/* Panel izquierdo: formulario */}
        <div
          className={`absolute inset-y-0 left-0 flex w-full items-center justify-center bg-surface px-margin transition-transform duration-700 ease-out md:w-1/2 ${
            split ? "-translate-x-full" : "translate-x-0"
          }`}
        >
          <div className="w-full max-w-sm">
            {children}
          </div>
        </div>

        {/* Panel derecho: marca + franja de color (división) */}
        <div
          className={`absolute inset-y-0 right-0 hidden w-1/2 items-center justify-center bg-surface-dim grid-bg transition-transform duration-700 ease-out md:flex ${
            split ? "translate-x-full" : "translate-x-0"
          }`}
          aria-hidden="true"
        >
          <div className="z-10 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-on-surface-variant/70">
              {brandTag}
            </p>
            <h2 className="mt-2 text-4xl font-semibold tracking-[0.2em] text-on-surface">
              DIAGRAM-CTS
            </h2>
          </div>
        </div>
      </div>
    </AuthSplitContext.Provider>
  );
}