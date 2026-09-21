// Ensamblado del ZIP: estructura Maven estándar + colección Postman.
// jszip se importa estático aquí; este módulo solo se carga vía import()
// dinámico desde el handler del botón (componente "use client").

import JSZip from "jszip";
import type { UmlModelData } from "@/types/uml";
import { buildBackendModel, normalizeToUmlModel, type BackendModel } from "./mapper";
import { applicationJava, applicationProperties, iniciarBat, iniciarSh, mavenWrapperProperties, mvnwCmd, mvnwSh, pomXml, readmeMd } from "./templates";
import {
  controllerJava,
  entityJava,
  enumJava,
  interfaceJava,
  repositoryJava,
  serviceJava,
} from "./generators";
import { postmanCollectionJson } from "./postmanGenerator";
import { deriveJpaQueries } from "./mapper";
import { toPackageSlug } from "./utils";

export type { BackendModel };
export { buildBackendModel, normalizeToUmlModel };

export interface PreviewData {
  model: BackendModel;
  entityCount: number;
  relationCount: number;
  hasAmbiguous: boolean;
}

/** Vista previa para el modal: sin ZIP, solo el modelo resuelto. */
export function buildPreview(
  esquema: Record<string, unknown> | null,
  projectName: string,
  fkOverrides: Record<string, string> = {}
): PreviewData {
  const uml = normalizeToUmlModel(esquema);
  const model = buildBackendModel(uml, projectName, fkOverrides);
  return {
    model,
    entityCount: model.entities.length,
    relationCount: model.fkChoices.length,
    hasAmbiguous: model.fkChoices.some((f) => f.ambiguous),
  };
}

function pkTypeOf(model: BackendModel, entityKey: string): string {
  const e = model.entities.find((x) => x.key === entityKey);
  if (e?.pk) return e.pk.javaType;
  if (e?.parentKey) return pkTypeOf(model, e.parentKey);
  return "Long";
}

/**
 * Genera el ZIP completo del backend Spring Boot y lo devuelve como Blob.
 * Entrada: esquemaJson GUARDADO del proyecto (no el canvas vivo).
 */
export async function exportarSpringBootZip(
  esquema: Record<string, unknown> | null,
  projectName: string,
  fkOverrides: Record<string, string> = {}
): Promise<Blob> {
  const uml: UmlModelData = normalizeToUmlModel(esquema);
  const model = buildBackendModel(uml, projectName, fkOverrides);
  if (model.entities.length === 0) {
    throw new Error("El diagrama no tiene clases que generen entidades.");
  }
  const slug = toPackageSlug(projectName);
  const artifactId = `${slug}-springboot`;
  const pkg = model.packageName;
  const pkgPath = pkg.replace(/\./g, "/");
  const base = `${artifactId}/src/main/java/${pkgPath}`;

  const zip = new JSZip();
  zip.file(`${artifactId}/pom.xml`, pomXml(pkg, artifactId));
  zip.file(`${artifactId}/src/main/resources/application.properties`, applicationProperties());
  zip.file(`${artifactId}/README.md`, readmeMd(projectName, model.entities.map((e) => resourceOf(e.className))));
  zip.file(`${artifactId}/.mvn/wrapper/maven-wrapper.properties`, mavenWrapperProperties());
  zip.file(`${artifactId}/mvnw`, mvnwSh());
  zip.file(`${artifactId}/mvnw.cmd`, mvnwCmd());
  zip.file(`${artifactId}/iniciar.bat`, iniciarBat());
  zip.file(`${artifactId}/iniciar.sh`, iniciarSh());
  zip.file(`${base}/${model.appName}.java`, applicationJava(pkg, model.appName));

  for (const en of model.enums) {
    zip.file(`${base}/entity/${en.className}.java`, enumJava(pkg, en));
  }
  for (const intf of model.interfaces) {
    zip.file(`${base}/entity/${intf.className}.java`, interfaceJava(pkg, intf));
  }
  for (const e of model.entities) {
    const pkType = pkTypeOf(model, e.key);
    const derived = deriveJpaQueries(e);
    zip.file(`${base}/entity/${e.className}.java`, entityJava(pkg, e));
    zip.file(`${base}/repository/${e.className}Repository.java`, repositoryJava(pkg, e, pkType, derived));
    zip.file(`${base}/service/${e.className}Service.java`, serviceJava(pkg, e, pkType, model.entities));
    zip.file(`${base}/controller/${e.className}Controller.java`, controllerJava(pkg, e, pkType, model.entities));
  }

  zip.file(`${artifactId}/postman_collection.json`, postmanCollectionJson(model));

  return zip.generateAsync({ type: "blob" });
}

function resourceOf(className: string): string {
  const base = className.toLowerCase();
  return base.endsWith("s") ? `${base}es` : `${base}s`;
}