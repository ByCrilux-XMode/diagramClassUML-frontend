import * as go from "gojs";
import type { 
    AttributeData,
    MethodData,
    ParameterData,
    RelationshipLinkData,
    Visibility,
} from "@/types/uml";
import { fontMono, fontSans } from "./theme";

const VISIBILITY_SYMBOL: Record<Visibility, string> = {
  "+": "+",
  "-": "-",
  "#": "#",
  "~": "~"
}

export function visibilitySymbol(visibility: Visibility): string {
    // Ejemplo: "+" -> "+", "-" -> "-", "#" -> "#", "~" -> "~"
    return VISIBILITY_SYMBOL[visibility];
}

export function formatAttribute(attr: AttributeData): string {
    // isDerived significa que su valor se calcula, no se guarda
    // Ejemplo: { visibility:"+", name:"id", type:"int", multiplicity:"[1]" } -> "+ id: int [1]"
    // Ejemplo derivado: { visibility:"-", isDerived:true, name:"edad", type:"int" } -> "- /edad: int"
    // Ejemplo readonly con valor por defecto: { visibility:"#", name:"serial", type:"UUID",
    //   defaultValue:"UUID()", isReadOnly:true } -> "# serial: UUID = UUID() {readOnly}"
    const name = attr.isDerived ? `/${attr.name}` : attr.name;
    const type = attr.type ? `: ${attr.type}` : "";
    const multiplicity = attr.multiplicity ? ` [${attr.multiplicity}]` : "";
    const defaultValue = attr.defaultValue ? ` = ${attr.defaultValue}` : "";
    const props: string[] = [];
    if (attr.isReadOnly) props.push("readOnly"); //readonly es algo constante tras su inicializacion, no se lo puede cambiar, es el final en java
    const properties = props.length ? ` {${props.join(", ")}}` : "";
    return `${visibilitySymbol(attr.visibility)} ${name}${type}${multiplicity}${defaultValue}${properties}`;
}

export function formatParameter(param: ParameterData): string {
    // Ejemplo: { name:"nombre", type:"string" } -> "nombre: string"
    // Ejemplo direccion: { direction:"out", name:"errores", type:"string[]" } -> "out errores: string[]"
    // Ejemplo con defecto: { name:"limite", type:"int", defaultValue:"10" } -> "limite: int = 10"
    const direction = param.direction === "in" ? "" : `${param.direction} `;
    const defaultValue = param.defaultValue ? ` = ${param.defaultValue}` : "";
    return `${direction}${param.name}: ${param.type}${defaultValue}`;
}

export function formatMethod(method: MethodData): string {
    // Ejemplo: { visibility:"+", name:"calcularTotal",
    //   parameters:[{name:"subtotal",type:"double"}], returnType:"double" } -> "+ calcularTotal(subtotal: double): double"
    // Ejemplo sin retorno: { visibility:"-", name:"guardar" } -> "- guardar()"
    // Ejemplo con multiplicidad: { visibility:"+", name:"obtenerTodos", returnType:"List<Usuario>",
    //   multiplicity:"[*]" } -> "+ obtenerTodos(): List<Usuario> [*]"
    const params = method.parameters.map(formatParameter).join(", ");
    const returnType = method.returnType ? `: ${method.returnType}` : "";
    const multiplicity = method.multiplicity ? ` [${method.multiplicity}]` : "";
    return `${visibilitySymbol(method.visibility)} ${method.name}(${params})${returnType}${multiplicity}`;
}

export function formatFromEnd(link: RelationshipLinkData): string {
    return formatLinkEnd(link, "from");
}

export function formatToEnd(link: RelationshipLinkData): string {
    return formatLinkEnd(link, "to");
}

export function formatLinkEnd(link: RelationshipLinkData, end: "from" | "to"): string {
    // Ejemplo con rol y multiplicidad: toRole="jefe", toMultiplicity="0..*" -> "jefe\n0..*"
    // Ejemplo solo rol: fromRole="empleado", fromMultiplicity="" -> "empleado"
    // Ejemplo solo multiplicidad: toRole="", toMultiplicity="1" -> "1"
    // Ejemplo vacio: toRole="", toMultiplicity="" -> ""
    const role = end === "from" ? link.fromRole : link.toRole;
    const mult = end === "from" ? link.fromMultiplicity : link.toMultiplicity;
    return [role, mult].filter(
        (value): value is string => Boolean(value)
    ).join("\n");
}

export function parseLoc(loc?: string): go.Point {
    // Ejemplo: "120 240" -> go.Point(120, 240)
    // Ejemplo: undefined / "" -> go.Point(0, 0)
    const [x = 0, y = 0] = (loc ?? "0 0").split(" ").map(Number);
    return new go.Point(x, y);
}

export function formatLoc(point: go.Point): string {
    // Ejemplo: go.Point(120, 240) -> "120 240"
    return `${point.x} ${point.y}`;
}

export function parseSize(size?: string): go.Size {
    if (!size) return new go.Size(NaN, NaN);
    const [w = NaN, h = NaN] = size.split(" ").map(Number);
    if (isNaN(w) || isNaN(h)) return new go.Size(NaN, NaN);
    return new go.Size(w,h);
}

export function formatSize(size: go.Size): string {
    return `${Math.round(size.width)} ${Math.round(size.height)}`;
}
export function fontForAbstract(isAbstract: boolean): string {
    return fontMono("12px", "400", isAbstract ? "italic" : undefined);
}

export function fontForClassName(isAbstract: boolean): string {
    return fontSans("14px", "600", isAbstract ? "italic" : undefined);
}

export function toUnderline(isStatic: boolean): boolean {
    return Boolean(isStatic);
}