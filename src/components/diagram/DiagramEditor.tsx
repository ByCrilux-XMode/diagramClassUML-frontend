"use client";

import { forwardRef } from "react";
import dynamic from "next/dynamic";
import type { GoJSCanvasHandle } from "./GoJSCanvas";
import type { EstadoColaboracion } from "@/hooks/useColaboracion";

export interface DiagramEditorProps {
  esquemaInicial?: Record<string, unknown> | null;
  proyectoId?: string;
  readOnly?: boolean;
  nombreUsuario?: string;
  onEstadoColaboracion?: (estado: EstadoColaboracion) => void;
}

const GoJSCanvas = dynamic(() => import("./GoJSCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-3 bg-[#2b2a28] text-on-primary">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-on-primary/25 border-t-primary-fixed" />
      Cargando editor...
    </div>
  ),
}) as unknown as React.ForwardRefExoticComponent<
  React.PropsWithoutRef<DiagramEditorProps> & React.RefAttributes<GoJSCanvasHandle>
>;

const DiagramEditor = forwardRef<GoJSCanvasHandle, DiagramEditorProps>(
  function DiagramEditor(props, ref) {
    return <GoJSCanvas {...props} ref={ref} />;
  }
);

export default DiagramEditor;