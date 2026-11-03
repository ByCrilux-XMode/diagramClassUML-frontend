import { analyze } from "@/lib/rules";
import type { ValidationResult } from "../define";
import { fail, isObject } from "../define";
import type { ToolDef } from "../define";
import { requireDiagram } from "../helpers";
import { modelToUmlModel } from "../serializer";

export type ValidateArgs = Record<string, never>;

export const validateTool = {
  name: "validate",
  description:
    "Valida el diagrama actual: devuelve observaciones (issues) y sugerencias de claves foráneas (fkPlacements) según las reglas de multiplicidad.",
  readOnly: true,
  parameters: { type: "object", properties: {} },

  validate(raw: unknown): ValidationResult<ValidateArgs> {
    if (!isObject(raw)) return fail("Los argumentos deben ser un objeto.");
    return { ok: true, value: {} };
  },

  execute() {
    const diagram = requireDiagram();
    const result = analyze(modelToUmlModel(diagram));
    return {
      ok: true,
      message: result.issues.length
        ? `Validación completada con ${result.issues.length} observaciones.`
        : "Validación completada sin observaciones.",
      data: { issues: result.issues, fkPlacements: result.fkPlacements },
    };
  },
} satisfies ToolDef<ValidateArgs, "validate">;
