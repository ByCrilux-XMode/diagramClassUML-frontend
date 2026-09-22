"use client";

import type { ReactNode } from "react";
import { Plus, X } from "lucide-react";
import type {
  AttributeData,
  MethodData,
  ParameterData,
  UmlNodeData,
  Visibility,
} from "@/types/uml";

const VISIBILITY_OPTIONS: Visibility[] = ["+", "-", "#", "~"];
const DIRECTION_OPTIONS = ["in", "out", "inout"] as const;

const fieldClass =
  "min-w-0 flex-1 rounded border border-outline-variant bg-surface-container-lowest px-2 py-0.5 font-code-sm text-code-sm text-on-surface transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-outline/70";
const selectClass =
  "rounded border border-outline-variant bg-surface-container-lowest px-1 py-0.5 font-code-sm text-code-sm text-on-surface focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";
const buttonGhost =
  "rounded border border-outline-variant px-2 py-0.5 font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:bg-surface-variant";
const iconButton =
  "rounded border border-outline-variant/60 p-0.5 text-on-surface-variant transition-colors hover:bg-surface-variant";

interface NodeInspectorProps {
  data: UmlNodeData;
  onChange: (updates: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function NodeInspector({
  data,
  onChange,
  onClose,
}: NodeInspectorProps) {
  const commit = (updates: Record<string, unknown>) => onChange(updates);

  return (
    <aside className="flex h-full w-full flex-col gap-2 overflow-y-auto bg-surface-container-low p-2">
      <div className="flex shrink-0 items-center justify-between">
        <h3 className="truncate font-badge-label text-badge-label text-on-surface">
          Propiedades · {data.name}
        </h3>
        <button
          onClick={onClose}
          className={iconButton}
          title="Cerrar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        <GeneralCard data={data} commit={commit} />

        {data.category === "Class" && (
          <AttributesCard data={data} commit={commit} />
        )}

        {(data.category === "Class" || data.category === "Interface") && (
          <MethodsCard data={data} commit={commit} />
        )}

        {data.category === "Enum" && (
          <LiteralsCard data={data} commit={commit} />
        )}
      </div>
    </aside>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h4 className="mb-1 font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
      {children}
    </h4>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5 rounded border border-outline-variant/40 bg-surface-container-lowest p-2">
      {children}
    </section>
  );
}

function GeneralCard({
  data,
  commit,
}: {
  data: UmlNodeData;
  commit: (updates: Record<string, unknown>) => void;
}) {
  return (
    <Card>
      <SectionTitle>General</SectionTitle>
      <label className="flex flex-col gap-1">
        <span className="font-badge-label text-badge-label font-bold uppercase tracking-wider text-on-surface-variant">
          Nombre
        </span>
        <input
          type="text"
          value={data.name}
          onChange={(e) => commit({ name: e.target.value })}
          className={fieldClass}
        />
      </label>

      {data.category === "Class" && (
        <label className="flex items-center gap-2 font-code-sm text-code-sm text-on-surface-variant">
          <input
            type="checkbox"
            checked={data.isAbstract}
            onChange={(e) => commit({ isAbstract: e.target.checked })}
            className="h-4 w-4 accent-[#006877]"
          />
          Clase abstracta (nombre en cursiva)
        </label>
      )}
    </Card>
  );
}

function AttributesCard({
  data,
  commit,
}: {
  data: Extract<UmlNodeData, { category: "Class" }>;
  commit: (updates: Record<string, unknown>) => void;
}) {
  const attrs = Array.isArray(data.attributes) ? data.attributes : [];
  const patch = (index: number, attr: AttributeData) =>
    commit({
      attributes: attrs.map((a, i) => (i === index ? attr : a)),
    });
  const remove = (index: number) =>
    commit({ attributes: attrs.filter((_, i) => i !== index) });
  const add = () =>
    commit({
      attributes: [
        ...attrs,
        { name: "campo", type: "String", visibility: "+" as Visibility },
      ],
    });

  return (
    <Card>
      <SectionTitle>Atributos</SectionTitle>
      <div className="flex flex-col gap-1.5">
        {attrs.map((attr, i) => (
          <div
            key={i}
            className="flex flex-col gap-1 rounded border border-outline-variant/40 bg-surface-container-low p-1.5"
          >
            <div className="flex items-center gap-1">
              <select
                value={attr.visibility}
                onChange={(e) =>
                  patch(i, {
                    ...attr,
                    visibility: e.target.value as Visibility,
                  })
                }
                className={selectClass}
              >
                {VISIBILITY_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={attr.name}
                onChange={(e) => patch(i, { ...attr, name: e.target.value })}
                className={fieldClass}
                placeholder="nombre"
              />
              <button
                onClick={() => remove(i)}
                className={iconButton}
                title="Eliminar atributo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <input
              type="text"
              value={attr.type}
              onChange={(e) => patch(i, { ...attr, type: e.target.value })}
              className={fieldClass}
              placeholder="Tipo (String, Integer, ...)"
            />
            <input
              type="text"
              value={attr.multiplicity ?? ""}
              onChange={(e) =>
                patch(i, {
                  ...attr,
                  multiplicity: e.target.value
                    ? (e.target.value as AttributeData["multiplicity"])
                    : undefined,
                })
              }
              className={fieldClass}
              placeholder="Multiplicidad (1, 0..1, *)"
            />
          </div>
        ))}
      </div>
      <button onClick={add} className={`${buttonGhost} mt-1 flex items-center gap-1 self-start`}>
        <Plus className="h-3 w-3" />
        Atributo
      </button>
    </Card>
  );
}

function MethodsCard({
  data,
  commit,
}: {
  data: Extract<UmlNodeData, { category: "Class" | "Interface" }>;
  commit: (updates: Record<string, unknown>) => void;
}) {
  const methods = Array.isArray(data.methods) ? data.methods : [];
  const patch = (index: number, method: MethodData) =>
    commit({
      methods: methods.map((m, i) => (i === index ? method : m)),
    });
  const remove = (index: number) =>
    commit({ methods: methods.filter((_, i) => i !== index) });
  const add = () =>
    commit({
      methods: [
        ...methods,
        {
          name: "metodo",
          visibility: "+" as Visibility,
          parameters: [],
          returnType: "Void",
        },
      ],
    });

  const patchParam = (index: number, pIndex: number, param: ParameterData) =>
    patch(index, {
      ...methods[index],
      parameters: methods[index].parameters.map((p, pi) =>
        pi === pIndex ? param : p
      ),
    });
  const removeParam = (index: number, pIndex: number) =>
    patch(index, {
      ...methods[index],
      parameters: methods[index].parameters.filter((_, pi) => pi !== pIndex),
    });
  const addParam = (index: number) =>
    patch(index, {
      ...methods[index],
      parameters: [
        ...methods[index].parameters,
        { direction: "in", name: "param", type: "String" },
      ],
    });

  return (
    <Card>
      <SectionTitle>Métodos</SectionTitle>
      <div className="flex flex-col gap-1.5">
        {methods.map((method, i) => (
          <div
            key={i}
            className="flex flex-col gap-1 rounded border border-outline-variant/40 bg-surface-container-low p-1.5"
          >
            <div className="flex items-center gap-1">
              <select
                value={method.visibility}
                onChange={(e) =>
                  patch(i, {
                    ...method,
                    visibility: e.target.value as Visibility,
                  })
                }
                className={selectClass}
              >
                {VISIBILITY_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={method.name}
                onChange={(e) =>
                  patch(i, { ...method, name: e.target.value })
                }
                className={fieldClass}
                placeholder="nombre"
              />
              <button
                onClick={() => remove(i)}
                className={iconButton}
                title="Eliminar método"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={method.returnType ?? ""}
                onChange={(e) =>
                  patch(i, { ...method, returnType: e.target.value || undefined })
                }
                className={fieldClass}
                placeholder="Retorno (Void, Boolean, ...)"
              />
            </div>

            {method.parameters.map((param, pi) => (
              <div key={pi} className="flex items-center gap-1">
                <select
                  value={param.direction}
                  onChange={(e) =>
                    patchParam(i, pi, {
                      ...param,
                      direction: e.target.value as ParameterData["direction"],
                    })
                  }
                  className={selectClass}
                  title="Dirección del parámetro"
                >
                  {DIRECTION_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={param.name}
                  onChange={(e) =>
                    patchParam(i, pi, { ...param, name: e.target.value })
                  }
                  className={fieldClass}
                  placeholder="param"
                />
                <input
                  type="text"
                  value={param.type}
                  onChange={(e) =>
                    patchParam(i, pi, { ...param, type: e.target.value })
                  }
                  className={fieldClass}
                  placeholder="Tipo"
                />
                <input
                  type="text"
                  value={param.defaultValue ?? ""}
                  onChange={(e) =>
                    patchParam(i, pi, {
                      ...param,
                      defaultValue: e.target.value || undefined,
                    })
                  }
                  className="w-16 shrink-0 rounded border border-outline-variant bg-surface-container-lowest px-2 py-1 font-code-sm text-code-sm text-on-surface placeholder:text-outline/70 focus:border-primary focus:outline-none"
                  placeholder="= val"
                  title="Valor por defecto"
                />
                <button
                  onClick={() => removeParam(i, pi)}
                  className={iconButton}
                  title="Eliminar parámetro"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button
              onClick={() => addParam(i)}
              className={`${buttonGhost} flex items-center gap-1 self-start`}
            >
              <Plus className="h-3 w-3" />
              Parámetro
            </button>
          </div>
        ))}
      </div>
      <button onClick={add} className={`${buttonGhost} mt-1 flex items-center gap-1 self-start`}>
        <Plus className="h-3 w-3" />
        Método
      </button>
    </Card>
  );
}

function LiteralsCard({
  data,
  commit,
}: {
  data: Extract<UmlNodeData, { category: "Enum" }>;
  commit: (updates: Record<string, unknown>) => void;
}) {
  const literals = Array.isArray(data.literals) ? data.literals : [];
  const patch = (index: number, value: string) =>
    commit({ literals: literals.map((l, i) => (i === index ? value : l)) });
  const remove = (index: number) =>
    commit({ literals: literals.filter((_, i) => i !== index) });
  const add = () => commit({ literals: [...literals, "NUEVO"] });

  return (
    <Card>
      <SectionTitle>Literales</SectionTitle>
      <div className="flex flex-col gap-1.5">
        {literals.map((literal, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              type="text"
              value={literal}
              onChange={(e) => patch(i, e.target.value)}
              className={fieldClass}
            />
            <button
              onClick={() => remove(i)}
              className={iconButton}
              title="Eliminar literal"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button onClick={add} className={`${buttonGhost} mt-1 flex items-center gap-1 self-start`}>
        <Plus className="h-3 w-3" />
        Literal
      </button>
    </Card>
  );
}