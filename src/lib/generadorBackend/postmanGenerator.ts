// Colección Postman v2.1.0: una carpeta por entidad con CRUD preconfigurado.
// El cuerpo de ejemplo excluye la PK; las relaciones van como {"id": 1}.

import type { BackendModel } from "./mapper";
import { toResourcePlural } from "./utils";

interface PostmanItem {
  name: string;
  request: {
    method: string;
    header: { key: string; value: string }[];
    url: { raw: string; host: string[]; path: string[] };
    body?: { mode: string; raw: string; options: { raw: { language: string } } };
  };
  response: unknown[];
}

function pkJsonNameOf(model: BackendModel, targetClassName: string): string {
  const t = model.entities.find((x) => x.className === targetClassName);
  return t?.pk?.javaName ?? "id";
}

function exampleBody(model: BackendModel, entityKey: string): string {
  const e = model.entities.find((x) => x.key === entityKey);
  if (!e) return "{}";
  const parts: string[] = [];
  for (const s of e.scalars) parts.push(`    "${s.javaName}": ${s.sampleJson}`);
  for (const r of e.relations) parts.push(`    "${r.javaName}": { "${pkJsonNameOf(model, r.targetClassName)}": 1 }`);
  if (parts.length === 0) return "{}";
  return `{\n${parts.join(",\n")}\n}`;
}

function req(name: string, method: string, path: string, body?: string): PostmanItem {
  const item: PostmanItem = {
    name,
    request: {
      method,
      header: [{ key: "Content-Type", value: "application/json" }],
      url: { raw: `{{baseUrl}}${path}`, host: ["{{baseUrl}}"], path: path.replace(/^\//, "").split("/") },
      ...(body !== undefined
        ? { body: { mode: "raw", raw: body, options: { raw: { language: "json" } } } }
        : {}),
    },
    response: [],
  };
  return item;
}

export function postmanCollectionJson(model: BackendModel): string {
  const folders = model.entities.map((e) => {
    const resource = `/api/${toResourcePlural(e.className)}`;
    const body = exampleBody(model, e.key);
    return {
      name: e.className,
      item: [
        req(`Crear ${e.className}`, "POST", resource, body),
        req(`Listar ${e.className}`, "GET", resource),
        req(`Obtener ${e.className}`, "GET", `${resource}/1`),
        req(`Actualizar ${e.className}`, "PUT", `${resource}/1`, body),
        req(`Eliminar ${e.className}`, "DELETE", `${resource}/1`),
      ],
    };
  });
  const collection = {
    info: {
      _postman_id: "uml-springboot-generado",
      name: "Backend Spring Boot (generado desde UML)",
      schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    variable: [{ key: "baseUrl", value: "http://localhost:8080" }],
    item: folders,
  };
  return JSON.stringify(collection, null, 2);
}