import type { ValidationResult } from "../define";
import { fail, isObject } from "../define";
import type { ToolDef } from "../define";
import { requireDiagram } from "../helpers";
import { jsonToModel } from "../serializer";
import { createLinkTemplateMap, createNodeTemplateMap } from "@/lib/go/registry";

export interface ReplaceAllArgs {
  modelJson: string;
}

export const replaceAllTool = {
  name: "replaceAll",
  description:
    "Reemplaza el modelo completo del diagrama por un JSON. Acepta {nodes, links} con datos UML o un JSON exportado de GoJS con 'class': 'GraphLinksModel'. Falla si un enlace referencia un nodo inexistente.",
  destructive: true,
  parameters: {
    type: "object",
    properties: {
      modelJson: { type: "string", description: "JSON serializado del modelo." },
    },
    required: ["modelJson"],
  },

  validate(raw: unknown): ValidationResult<ReplaceAllArgs> {
    if (!isObject(raw)) return fail("Los argumentos deben ser un objeto.");
    const modelJson = raw.modelJson;
    if (typeof modelJson !== "string" || modelJson.trim() === "") return fail("'modelJson' es obligatorio y debe ser texto.");
    return { ok: true, value: { modelJson } };
  },

  execute(args: ReplaceAllArgs) {
    const diagram = requireDiagram();
    const model = jsonToModel(args.modelJson);
    diagram.model = model;
    diagram.nodeTemplateMap = createNodeTemplateMap();
    diagram.linkTemplateMap = createLinkTemplateMap();
    return {
      ok: true,
      message: "Diagrama reemplazado.",
      data: { nodes: model.nodeDataArray.length, links: model.linkDataArray.length },
    };
  },
} satisfies ToolDef<ReplaceAllArgs, "replaceAll">;
