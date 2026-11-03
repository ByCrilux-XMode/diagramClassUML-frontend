"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Bot, ChevronDown, ChevronRight, Settings, User } from "lucide-react";
import type { EventoApi } from "@/lib/actividad/api";
import type { CambioActividad } from "@/lib/actividad/diff";
import { esClaveTecnica, etiquetaCampo, etiquetaEntidad } from "@/lib/actividad/etiquetas";

const ETIQUETA_ENTIDAD: Record<CambioActividad["entidadTipo"], string> = {
  clase: "Clase",
  relacion: "Relación",
  atributo: "Atributo",
  metodo: "Método",
};

const ETIQUETA_ACCION: Record<CambioActividad["accion"], string> = {
  crear: "Añadido",
  actualizar: "Modificado",
  eliminar: "Eliminado",
};

const COLOR_ACCION: Record<CambioActividad["accion"], string> = {
  crear: "bg-green-600/10 text-green-700",
  actualizar: "bg-amber-500/10 text-amber-700",
  eliminar: "bg-red-500/10 text-red-700",
};

/** Claves técnicas que pueden venir en eventos antiguos. */
const CLAVE_TECNICA = /\b(?:node-\d+|ghost-[0-9a-z-]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{24})\b/gi;

/**
 * Los eventos antiguos guardaron claves como `node-1793…` en el resumen. En la
 * vista se sustituyen por texto legible; los eventos nuevos ya no las usan.
 */
function limpiarResumen(texto: string): string {
  if (!/node-\d+|ghost-|[0-9a-f]{8}-[0-9a-f]{4}-|\b[0-9a-f]{24}\b|→\s*undefined/i.test(texto)) return texto;
  return texto
    .replace(
      /relación\s+node-\d+\s*→\s*(?:node-\d+|undefined)\s*(\([^)]*\))?/gi,
      (_, multiplicidad: string | undefined) =>
        `relación entre clases${multiplicidad ? ` ${multiplicidad}` : ""}`,
    )
    .replace(/la clase\s+node-\d+/gi, "una clase")
    .replace(/node-\d+\./g, "")
    .replace(/\s*→\s*undefined/gi, "")
    .replace(/\bundefined\b/gi, "")
    .replace(CLAVE_TECNICA, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function tiempoRelativo(iso: string): string {
  const fecha = new Date(iso).getTime();
  if (Number.isNaN(fecha)) return "";
  const segundos = Math.max(0, Math.round((Date.now() - fecha) / 1000));
  if (segundos < 60) return `hace ${segundos} s`;
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  return new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short" });
}

function fechaCompleta(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return fecha.toLocaleString("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function recortar(valor: unknown): string {
  if (valor === undefined || valor === null) return "—";
  const texto = typeof valor === "string" ? valor : JSON.stringify(valor);
  return texto.length > 120 ? `${texto.slice(0, 120)}…` : texto;
}

/** Nombre visible de la entidad, sin claves internas cuando hay datos legibles. */
function nombreEntidad(cambio: CambioActividad): string {
  const entidad = (cambio.despues ?? cambio.antes) as Record<string, unknown> | null;

  if (cambio.entidadTipo === "relacion") {
    if (entidad && typeof entidad.from === "string" && typeof entidad.to === "string") {
      const origen = etiquetaEntidad(entidad.from);
      const destino = etiquetaEntidad(entidad.to);
      if (origen && destino) return `${origen} → ${destino}`;
    }
    return "";
  }

  if (entidad && typeof entidad.name === "string" && !esClaveTecnica(entidad.name)) {
    return entidad.name;
  }

  // Las claves de atributos y métodos son `clase.nombre`; el nombre basta.
  const cola = cambio.entidadKey.split(".").pop() ?? "";
  return esClaveTecnica(cola) ? "" : cola.replace(/\(\)$/, "");
}

function DetalleCambio({ cambio }: { cambio: CambioActividad }) {
  // En altas y bajas el nombre ya cuenta la historia; los valores solo aportan
  // ruido técnico. En las modificaciones sí se muestra el antes y el después.
  const mostrarValores =
    cambio.accion === "actualizar" &&
    (cambio.antes !== undefined || cambio.despues !== undefined);
  const entidad = nombreEntidad(cambio);

  return (
    <li className="rounded bg-surface-container-lowest/70 px-1.5 py-1">
      <div className="flex flex-wrap items-center gap-1">
        <span
          className={`rounded px-1 py-0.5 font-badge-label text-[8px] font-bold uppercase tracking-wider ${COLOR_ACCION[cambio.accion]}`}
        >
          {ETIQUETA_ACCION[cambio.accion]}
        </span>
        <span className="font-body-md text-[12px] text-on-surface">
          {ETIQUETA_ENTIDAD[cambio.entidadTipo]}
          {entidad ? <span className="font-semibold text-primary"> {entidad}</span> : null}
          {cambio.campo ? (
            <span className="text-on-surface-variant"> · {etiquetaCampo(cambio.campo)}</span>
          ) : null}
        </span>
      </div>
      {mostrarValores && (
        <p className="mt-0.5 break-words font-code-sm text-[10px] text-on-surface-variant">
          {recortar(cambio.antes)} → {recortar(cambio.despues)}
        </p>
      )}
    </li>
  );
}

function iconoActor(evento: EventoApi) {
  if (evento.actorTipo === "ia") return <Bot className="h-3 w-3" />;
  if (evento.actorTipo === "sistema") return <Settings className="h-3 w-3" />;
  return <User className="h-3 w-3" />;
}

function estiloIcono(evento: EventoApi): string {
  if (evento.actorTipo === "ia") return "bg-primary/10 text-primary";
  return "bg-surface-container-high text-on-surface-variant";
}

function nombreActor(evento: EventoApi, usuarioId?: number): string {
  if (evento.actorTipo === "sistema") return "Sistema";
  if (
    evento.actorTipo === "humano" &&
    usuarioId !== undefined &&
    evento.actorUsuarioId === usuarioId
  ) {
    return "Tú";
  }
  return evento.actorNombre;
}

function ClaseFila({
  evento,
  destacado,
  children,
}: {
  evento: EventoApi;
  destacado?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${estiloIcono(evento)}`}
      >
        {iconoActor(evento)}
      </span>
      <div
        className={`min-w-0 flex-1 rounded-md px-2.5 py-1.5 transition-colors ${
          destacado
            ? "bg-primary/5 ring-1 ring-primary/40"
            : "bg-surface-container-low hover:bg-surface-container"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function Expansor({ abierto }: { abierto: boolean }) {
  return abierto ? (
    <ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-on-surface-variant" />
  ) : (
    <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-on-surface-variant" />
  );
}

function ResumenMeta({
  evento,
  usuarioId,
}: {
  evento: EventoApi;
  usuarioId?: number;
}) {
  const esIA = evento.actorTipo === "ia";
  const nombre = nombreActor(evento, usuarioId);
  const resumen = evento.resumen.toLocaleLowerCase("es");
  const primerNombre = evento.actorNombre.trim().split(/\s+/)[0] ?? "";
  // El resumen ya suele empezar con el autor. Repetirlo debajo solo añade
  // ruido; se omite salvo que el texto no lo mencione. "Tú" sí se muestra
  // siempre: el resumen trae el nombre real, no la marca de primera persona.
  const yaMencionado =
    nombre !== "Tú" &&
    (resumen.includes(nombre.toLocaleLowerCase("es")) ||
      (primerNombre.length > 2 && resumen.includes(primerNombre.toLocaleLowerCase("es"))));
  const haySolicitud = esIA && Boolean(evento.solicitadoPor);

  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-code-sm text-[10px] text-on-surface-variant">
      {!yaMencionado && (
        <span className={esIA ? "font-medium text-primary" : "font-medium text-on-surface"}>
          {nombre}
        </span>
      )}
      {haySolicitud && evento.solicitadoPor && (
        <span>{!yaMencionado ? "· " : ""}a pedido de {evento.solicitadoPor.nombre}</span>
      )}
      <span>
        {!yaMencionado || haySolicitud ? "· " : ""}
        {tiempoRelativo(evento.creadoEn)}
      </span>
    </span>
  );
}

function DetalleEvento({ evento }: { evento: EventoApi }) {
  return (
    <div className="mt-1.5 space-y-1.5 border-t border-outline-variant/40 pt-1.5">
      <ul className="space-y-1">
        {evento.cambios.map((cambio, indice) => (
          <DetalleCambio
            key={`${cambio.entidadKey}-${cambio.campo ?? ""}-${indice}`}
            cambio={cambio}
          />
        ))}
      </ul>
      <p className="font-code-sm text-[10px] text-on-surface-variant">
        {fechaCompleta(evento.creadoEn)}
        {evento.modelo ? ` · ${evento.modelo}` : ""}
      </p>
    </div>
  );
}

export function FilaEvento({
  evento,
  destacado,
  usuarioId,
}: {
  evento: EventoApi;
  destacado?: boolean;
  usuarioId?: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const tieneDetalle = evento.cambios.length > 0;

  return (
    <ClaseFila evento={evento} destacado={destacado}>
      <button
        type="button"
        onClick={() => tieneDetalle && setAbierto((valor) => !valor)}
        aria-expanded={tieneDetalle ? abierto : undefined}
        className={`flex w-full items-start gap-1.5 text-left ${
          tieneDetalle ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <span className="min-w-0 flex-1">
          <span className="block break-words font-body-md text-[12px] leading-snug text-on-surface">
            {limpiarResumen(evento.resumen)}
          </span>
          <ResumenMeta evento={evento} usuarioId={usuarioId} />
        </span>
        {tieneDetalle && <Expansor abierto={abierto} />}
      </button>
      {abierto && tieneDetalle && <DetalleEvento evento={evento} />}
    </ClaseFila>
  );
}

export function FilaGrupo({
  eventos,
  destacado,
  usuarioId,
}: {
  eventos: EventoApi[];
  destacado?: boolean;
  usuarioId?: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const primero = eventos[0];
  if (!primero) return null;

  const esIA = primero.actorTipo === "ia";
  const actor = nombreActor(primero, usuarioId);
  const sujeto = esIA ? "La IA" : actor;
  const verbo = actor === "Tú" ? "hiciste" : "hizo";
  const solicitud = primero.solicitadoPor?.nombre;

  return (
    <ClaseFila evento={primero} destacado={destacado}>
      <button
        type="button"
        onClick={() => setAbierto((valor) => !valor)}
        aria-expanded={abierto}
        className="flex w-full items-start gap-1.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block break-words font-body-md text-[12px] leading-snug text-on-surface">
            {sujeto} {verbo} {eventos.length} cambios en un turno
            {esIA && solicitud ? ` a pedido de ${solicitud}` : ""}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 font-code-sm text-[10px] text-on-surface-variant">
            <span>{tiempoRelativo(primero.creadoEn)}</span>
          </span>
        </span>
        <Expansor abierto={abierto} />
      </button>
      {abierto && (
        <div className="mt-1.5 space-y-1.5 border-t border-outline-variant/40 pt-1.5">
          {eventos.map((evento) => (
            <div key={evento._id} className="space-y-1">
              <p className="break-words font-body-md text-[12px] leading-snug text-on-surface">
                {limpiarResumen(evento.resumen)}
              </p>
              <ul className="space-y-1">
                {evento.cambios.map((cambio, indice) => (
                  <DetalleCambio
                    key={`${evento._id}-${cambio.entidadKey}-${indice}`}
                    cambio={cambio}
                  />
                ))}
              </ul>
            </div>
          ))}
          <p className="font-code-sm text-[10px] text-on-surface-variant">
            {fechaCompleta(primero.creadoEn)}
            {primero.modelo ? ` · ${primero.modelo}` : ""}
          </p>
        </div>
      )}
    </ClaseFila>
  );
}
