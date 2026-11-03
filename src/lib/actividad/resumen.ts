import type { CambioActividad, ResultadoDiff } from "./diff";
import type { ClaseSemantica, RelacionSemantica } from "./estado";
import { esClaveTecnica, etiquetaCampo, etiquetaEntidad } from "./etiquetas";

export interface ActorResumen {
  actorTipo: "humano" | "ia" | "sistema";
  actorNombre: string;
  solicitadoPor?: { nombre: string } | null;
}

function esClase(valor: unknown): valor is ClaseSemantica {
  return Boolean(valor) && typeof valor === "object" && "name" in (valor as object);
}

function esRelacion(valor: unknown): valor is RelacionSemantica {
  return Boolean(valor) && typeof valor === "object" && "from" in (valor as object);
}

function plural(cantidad: number, singular: string, plural_: string): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural_}`;
}

function nombreClase(cambio: CambioActividad): string {
  if (esClase(cambio.despues)) return cambio.despues.name;
  if (esClase(cambio.antes)) return cambio.antes.name;
  return etiquetaEntidad(cambio.entidadKey);
}

/** La clave es `clase.miembro`; el prefijo de la clase no se muestra. */
function nombreMiembro(cambio: CambioActividad): string {
  const partes = cambio.entidadKey.split(".");
  const nombre = (partes[partes.length - 1] ?? "").replace(/\(\)$/, "").trim();
  return esClaveTecnica(nombre) ? "" : nombre;
}

function describirRelacion(cambio: CambioActividad): string {
  const relacion = esRelacion(cambio.despues) ? cambio.despues : esRelacion(cambio.antes) ? cambio.antes : null;
  if (!relacion) return "";
  const origen = etiquetaEntidad(relacion.from);
  const destino = etiquetaEntidad(relacion.to);
  if (!origen || !destino) return "";
  const desde = relacion.fromMultiplicity ?? "1";
  const hasta = relacion.toMultiplicity ?? "1";
  return `${origen} → ${destino} (${desde} a ${hasta})`;
}

function describirUnico(cambio: CambioActividad, sujeto: string): string {
  switch (cambio.entidadTipo) {
    case "clase": {
      if (cambio.campo === "name") {
        return `${sujeto} renombró la clase ${String(cambio.antes)} a ${String(cambio.despues)}`;
      }
      const nombre = nombreClase(cambio);
      const clase = nombre ? `la clase ${nombre}` : "una clase";
      if (cambio.accion === "crear") return `${sujeto} creó ${clase}`;
      if (cambio.accion === "eliminar") return `${sujeto} eliminó ${clase}`;
      if (cambio.campo === "isAbstract") {
        return `${sujeto} marcó ${clase} como ${cambio.despues ? "abstracta" : "concreta"}`;
      }
      if (cambio.campo === "literals") {
        return `${sujeto} actualizó los literales de ${nombre || "una clase"}`;
      }
      return `${sujeto} actualizó ${clase}`;
    }
    case "relacion": {
      const descripcion = describirRelacion(cambio);
      const relacion = descripcion ? `la relación ${descripcion}` : "una relación";
      if (cambio.accion === "crear") return `${sujeto} creó ${relacion}`;
      if (cambio.accion === "eliminar") return `${sujeto} eliminó ${relacion}`;
      return `${sujeto} actualizó ${relacion}`;
    }
    case "atributo": {
      const nombre = nombreMiembro(cambio);
      const atributo = nombre ? `el atributo ${nombre}` : "un atributo";
      if (cambio.accion === "crear") return `${sujeto} agregó ${atributo}`;
      if (cambio.accion === "eliminar") return `${sujeto} quitó ${atributo}`;
      if (cambio.campo === "type") {
        return `${sujeto} cambió el tipo ${nombre ? `del atributo ${nombre}` : "de un atributo"} a ${String(cambio.despues)}`;
      }
      return `${sujeto} modificó ${cambio.campo ? etiquetaCampo(cambio.campo).toLocaleLowerCase("es") : "un campo"} ${nombre ? `del atributo ${nombre}` : "de un atributo"}`;
    }
    case "metodo": {
      const nombre = nombreMiembro(cambio);
      const metodo = nombre ? `el método ${nombre}` : "un método";
      if (cambio.accion === "crear") return `${sujeto} agregó ${metodo}`;
      if (cambio.accion === "eliminar") return `${sujeto} quitó ${metodo}`;
      if (cambio.campo === "parameters") {
        return `${sujeto} cambió los parámetros ${nombre ? `del método ${nombre}` : "de un método"}`;
      }
      return `${sujeto} modificó ${cambio.campo ? etiquetaCampo(cambio.campo).toLocaleLowerCase("es") : "un campo"} ${nombre ? `del método ${nombre}` : "de un método"}`;
    }
  }
}

/**
 * Texto legible del evento. Se genera en el cliente porque aquí están los
 * nombres visibles; el servidor solo conoce claves.
 */
export function construirResumen(resultado: ResultadoDiff, actor: ActorResumen): string {
  const { cambios } = resultado;
  if (cambios.length === 0) return "";

  const sujeto = actor.actorTipo === "ia" ? "La IA" : actor.actorNombre || "Alguien";
  let texto: string;

  if (cambios.length === 1) {
    texto = describirUnico(cambios[0], sujeto);
  } else {
    const clasesCreadas = cambios.filter((c) => c.entidadTipo === "clase" && c.accion === "crear");
    const clasesEliminadas = cambios.filter((c) => c.entidadTipo === "clase" && c.accion === "eliminar");
    const relaciones = cambios.filter((c) => c.entidadTipo === "relacion");

    if (clasesEliminadas.length === 1 && cambios.length === 1 + relaciones.length && relaciones.every((r) => r.accion === "eliminar")) {
      texto = `${sujeto} eliminó la clase ${nombreClase(clasesEliminadas[0])}`;
      if (relaciones.length > 0) {
        texto += ` y ${plural(relaciones.length, "relación", "relaciones")}`;
      }
    } else if (clasesCreadas.length === cambios.length) {
      texto = `${sujeto} creó ${plural(clasesCreadas.length, "clase", "clases")}`;
    } else if (clasesEliminadas.length === cambios.length) {
      texto = `${sujeto} eliminó ${plural(clasesEliminadas.length, "clase", "clases")}`;
    } else if (relaciones.length === cambios.length) {
      if (relaciones.every((r) => r.accion === "crear")) {
        texto = `${sujeto} creó ${plural(relaciones.length, "relación", "relaciones")}`;
      } else if (relaciones.every((r) => r.accion === "eliminar")) {
        texto = `${sujeto} eliminó ${plural(relaciones.length, "relación", "relaciones")}`;
      } else {
        texto = `${sujeto} actualizó ${plural(relaciones.length, "relación", "relaciones")}`;
      }
    } else {
      texto = `${sujeto} realizó ${plural(cambios.length, "cambio", "cambios")} en el diagrama`;
    }
  }

  if (actor.actorTipo === "ia" && actor.solicitadoPor?.nombre) {
    texto += ` a pedido de ${actor.solicitadoPor.nombre}`;
  }

  return texto;
}
