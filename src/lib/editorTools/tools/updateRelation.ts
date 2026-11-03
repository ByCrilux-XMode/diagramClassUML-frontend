import * as go from "gojs";
import type { Multiplicity, UMLRelationType } from "@/types/uml";
import type { ValidationResult } from "../define";
import { fail, isObject } from "../define";
import type { ToolDef } from "../define";
import { findLinkData, normalizeKey, normalizeRelationKind, requireDiagram } from "../helpers";

export interface UpdateRelationArgs {
  action: "update" | "remove";
  linkKey?: string;
  from?: string | number;
  to?: string | number;
  kind?: string;
  fromMult?: string;
  toMult?: string;
  label?: string;
}

export const updateRelationTool = {
  name: "updateRelation",
  description:
    "Actualiza o elimina una relación existente. Identifícala por 'linkKey' o por 'from' + 'to'. Si hay varias relaciones entre ese par, falla y devuelve las claves candidatas. Con action 'update' puedes cambiar 'kind', multiplicidades o etiqueta; con 'remove' la elimina.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["update", "remove"], description: "'update' modifica la relación; 'remove' la elimina." },
      linkKey: { type: "string", description: "Clave del enlace (preferida si la conoces)." },
      from: { type: "string", description: "Clave del nodo origen (alternativa a linkKey)." },
      to: { type: "string", description: "Clave del nodo destino (alternativa a linkKey)." },
      kind: { type: "string", enum: ["association", "aggregation", "composition", "generalization", "dependency", "realization", "inheritance"], description: "Nuevo tipo de relación (solo action 'update')." },
      fromMult: { type: "string", description: "Nueva multiplicidad del extremo 'from'." },
      toMult: { type: "string", description: "Nueva multiplicidad del extremo 'to'." },
      label: { type: "string", description: "Nueva etiqueta de la relación." },
    },
    required: ["action"],
  },

  validate(raw: unknown): ValidationResult<UpdateRelationArgs> {
    if (!isObject(raw)) return fail("Los argumentos deben ser un objeto.");
    const action = raw.action;
    if (action !== "update" && action !== "remove") {
      return fail("'action' debe ser 'update' o 'remove'.");
    }

    const hasKey = raw.linkKey !== undefined;
    if (hasKey && (typeof raw.linkKey !== "string" || raw.linkKey.trim() === "")) {
      return fail("'linkKey' debe ser texto no vacío.");
    }
    const hasFrom = raw.from !== undefined;
    const hasTo = raw.to !== undefined;
    if (hasFrom && typeof raw.from !== "string" && typeof raw.from !== "number") {
      return fail("'from' debe ser un identificador.");
    }
    if (hasTo && typeof raw.to !== "string" && typeof raw.to !== "number") {
      return fail("'to' debe ser un identificador.");
    }
    if (!hasKey && !(hasFrom && hasTo)) {
      return fail("Indica 'linkKey' o el par 'from' + 'to' para identificar la relación.");
    }
    if (raw.kind !== undefined && (typeof raw.kind !== "string" || raw.kind.trim() === "")) {
      return fail("'kind' debe ser texto no vacío.");
    }
    for (const field of ["fromMult", "toMult", "label"] as const) {
      if (raw[field] !== undefined && typeof raw[field] !== "string") {
        return fail(`'${field}' debe ser texto.`);
      }
    }
    if (action === "update") {
      const hasChange =
        raw.kind !== undefined ||
        raw.fromMult !== undefined ||
        raw.toMult !== undefined ||
        raw.label !== undefined;
      if (!hasChange) {
        return fail("Para 'update' indica al menos uno de 'kind', 'fromMult', 'toMult' o 'label'.");
      }
    }

    const value: UpdateRelationArgs = {
      action,
      ...(hasKey ? { linkKey: raw.linkKey as string } : {}),
      ...(hasFrom ? { from: raw.from as string | number } : {}),
      ...(hasTo ? { to: raw.to as string | number } : {}),
      ...(raw.kind !== undefined ? { kind: raw.kind as string } : {}),
      ...(raw.fromMult !== undefined ? { fromMult: raw.fromMult as string } : {}),
      ...(raw.toMult !== undefined ? { toMult: raw.toMult as string } : {}),
      ...(raw.label !== undefined ? { label: raw.label as string } : {}),
    };
    return { ok: true, value };
  },

  execute(args: UpdateRelationArgs) {
    const diagram = requireDiagram();
    const model = diagram.model as go.GraphLinksModel;
    const links = model.linkDataArray as Array<Record<string, unknown>>;

    let link: Record<string, unknown> | null = null;
    if (args.linkKey !== undefined) {
      link = findLinkData(diagram, args.linkKey);
      if (!link) return { ok: false, error: `No se encontró el enlace con clave '${args.linkKey}'.` };
    } else {
      const fromNorm = normalizeKey(args.from);
      const toNorm = normalizeKey(args.to);
      const matches = links.filter(
        (l) => normalizeKey(l["from"] as string | number) === fromNorm && normalizeKey(l["to"] as string | number) === toNorm
      );
      if (matches.length === 0) {
        return { ok: false, error: `No hay relación entre '${String(args.from)}' y '${String(args.to)}'.` };
      }
      if (matches.length > 1) {
        const candidates = matches
          .map((l) => `${String(l["key"])} (${String(l["category"])})`)
          .join(", ");
        return {
          ok: false,
          error: `Hay ${matches.length} relaciones entre '${String(args.from)}' y '${String(args.to)}'. Reintenta con linkKey: ${candidates}.`,
        };
      }
      link = matches[0];
    }

    if (args.action === "remove") {
      diagram.startTransaction("tool-updateRelation");
      try {
        model.removeLinkData(link);
      } finally {
        diagram.commitTransaction("tool-updateRelation");
      }
      return { ok: true, message: "Relación eliminada.", data: { removedKey: link["key"] } };
    }

    let kind: UMLRelationType | null = null;
    if (args.kind !== undefined) {
      kind = normalizeRelationKind(args.kind);
      if (!kind) return { ok: false, error: `Tipo de relación inválido: '${args.kind}'.` };
    }

    diagram.startTransaction("tool-updateRelation");
    try {
      if (kind) model.setDataProperty(link, "category", kind);
      if (args.fromMult !== undefined) {
        model.setDataProperty(link, "fromMultiplicity", args.fromMult as Multiplicity);
      }
      if (args.toMult !== undefined) {
        model.setDataProperty(link, "toMultiplicity", args.toMult as Multiplicity);
      }
      if (args.label !== undefined) model.setDataProperty(link, "name", args.label);
    } finally {
      diagram.commitTransaction("tool-updateRelation");
    }

    return {
      ok: true,
      message: "Relación actualizada.",
      data: {
        key: link["key"],
        kind: link["category"],
        fromMult: link["fromMultiplicity"] ?? null,
        toMult: link["toMultiplicity"] ?? null,
        label: link["name"] ?? null,
      },
    };
  },
} satisfies ToolDef<UpdateRelationArgs, "updateRelation">;
