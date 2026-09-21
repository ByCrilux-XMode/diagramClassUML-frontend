export type ToolName =
  | "addClass"
  | "removeClass"
  | "rename"
  | "connect"
  | "disconnect"
  | "updateAttribute"
  | "updateMethod"
  | "replaceAll"
  | "validate";

export interface ToolResult {
  ok: boolean;
  error?: string; // mensaje si falló
  message?: string; // humano (español), si ok
  data?: Record<string, unknown>; // serializable (JSON)
}

export type ToolArgs =
  | {
      key: string;
      name: string;
      loc?: string;
      category?: "Class" | "Interface" | "Enum";
      isAbstract?: boolean;
      literals?: string[];
      attributes?: Array<{
        name: string;
        type?: string;
        visibility?: "+" | "-" | "#" | "~";
      }>;
      methods?: Array<{
        name: string;
        visibility?: "+" | "-" | "#" | "~";
        parameters?: Array<{ name: string; type: string; direction?: "in" | "out" | "inout" }>;
        returnType?: string;
      }>;
    }
  | { key: string }
  | { key: string; newName: string }
  | {
      from: string | number;
      to: string | number;
      kind: string;
      fromMult?: string;
      toMult?: string;
      label?: string;
    }
  | { linkKey: string }
  | {
      classKey: string;
      action: "add" | "remove" | "update";
      attribute?: Partial<import("@/types/uml").AttributeData>;
      index?: number;
    }
  | {
      classKey: string;
      action: "add" | "remove" | "update";
      method?: Partial<import("@/types/uml").MethodData> & { name: string };
      index?: number;
    }
  | { modelJson: string }
  | Record<string, never>;