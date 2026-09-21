//export type Visibility = "public" | "private" | "protected" | "package";
export type Visibility = "+" | "-" | "#" | "~"; //uso

export type NodeCategory = "Class" | "Interface" | "Enum";

export type UMLRelationType = 
//1
"association" | 
//2
"aggregation" |
//3
"composition" | 
//4
"generalization" |
//5
"dependency" |
//6
"realization" 

export type ParameterDirection = "in" | "out" | "inout";

export type Multiplicity = 
"1" |
"0..1" | //el opcional
"*" | // "*" = "0..*"
"0..*" | // "*" = "0..*"
"1..*" |
`${string}..${string}`;

export interface ParameterData { //uso
    direction: ParameterDirection;
    name: string;
    type: string;
    defaultValue?: string;
}

export interface AttributeData { //uso
    name: string;
    type: string;
    visibility: Visibility;
    multiplicity?: Multiplicity;
    defaultValue?: string;
    isStatic?: boolean;
    isDerived?: boolean;
    isReadOnly?: boolean;
}

export interface MethodData { //uso
    name: string;
    visibility: Visibility;
    parameters: ParameterData[];
    returnType?: string;
    multiplicity?: Multiplicity;
    isStatic?: boolean;
    isAbstract?: boolean;
}

interface BaseUmlNodeData {
    key: string;
    name: string;
    loc?: string;
    size?: string;
    isGhost?: boolean;
}
//----------------------------------------------------------
export interface ClassNodeData extends BaseUmlNodeData {
    category: "Class";
    isAbstract: boolean;
    attributes: AttributeData[];
    methods: MethodData[];
}

export interface InterfaceNodeData extends BaseUmlNodeData {
    category: "Interface";
    methods: MethodData[];
}

export interface EnumNodeData extends BaseUmlNodeData {
    category: "Enum";
    literals: string[];
}
//----------------------------------------------------------
export type UmlNodeData = ClassNodeData | InterfaceNodeData | EnumNodeData;
//----------------------------------------------------------

export interface RelationshipLinkData { //uso
    key: string;
    category: UMLRelationType;
    from: string | number;
    to: string | number;
    fromRole?: string;
    toRole?: string;
    fromMultiplicity?: Multiplicity;
    toMultiplicity?: Multiplicity;
    fromNavigable?: boolean;
    toNavigable?: boolean;
    name?: string;
    isGhost?: boolean;
}

export interface UmlModelData {
    nodes: UmlNodeData[];
    links: RelationshipLinkData[];
}