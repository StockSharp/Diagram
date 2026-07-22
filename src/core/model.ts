export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
    [key: string]: JsonValue;
}

export interface DiagramParameterSchema {
    name: string;
    displayName: string;
    description: string;
    type: string;
    defaultValue: string;
    options: string[];
    min: number | null;
    max: number | null;
    displayOrder: number;
    category: string;
    isBasic: boolean;
    editorType: string;
}

export interface DiagramDocumentPort {
    id: string;
    name: string;
    description: string;
    type: string;
    maxLinks: number;
    availableTypes: string[];
    isDynamic: boolean;
    dynamicMode: string;
    isSibling: boolean;
    metadata: JsonObject;
}

export interface DiagramDocumentNode {
    id: string;
    typeId: string;
    name: string;
    description: string;
    groupName: string;
    x: number;
    y: number;
    color: string;
    border: string;
    icon: string;
    /** Persistent host text. Runtime and load errors belong to DiagramRuntimeState. */
    message: string;
    openAction: string;
    inPorts: DiagramDocumentPort[];
    outPorts: DiagramDocumentPort[];
    parameters: DiagramParameterSchema[];
    paramValues: Record<string, string>;
    metadata: JsonObject;
}

export interface DiagramDocumentEndpoint {
    nodeId: string;
    portId: string;
}

export interface DiagramDocumentLink {
    /** Stable identity used by selection, relinking and history. */
    id: string;
    from: DiagramDocumentEndpoint;
    to: DiagramDocumentEndpoint;
    metadata: JsonObject;
}

export const DIAGRAM_DOCUMENT_VERSION = 1 as const;
export type DiagramDocumentVersion = typeof DIAGRAM_DOCUMENT_VERSION;

export interface DiagramDocument {
    version: DiagramDocumentVersion;
    nodes: DiagramDocumentNode[];
    links: DiagramDocumentLink[];
    metadata: JsonObject;
}

export type DiagramDocumentPortInput = Pick<DiagramDocumentPort, 'id' | 'name'>
    & Partial<Omit<DiagramDocumentPort, 'id' | 'name'>>;

export type DiagramDocumentNodeInput = Pick<DiagramDocumentNode, 'id' | 'name'>
    & Partial<Omit<DiagramDocumentNode, 'id' | 'name' | 'inPorts' | 'outPorts'>>
    & {
        inPorts?: readonly DiagramDocumentPortInput[];
        outPorts?: readonly DiagramDocumentPortInput[];
    };

export type DiagramDocumentLinkInput = Omit<DiagramDocumentLink, 'id' | 'metadata'> & {
    id?: string;
    metadata?: JsonObject;
};

export interface DiagramDocumentInput {
    nodes?: readonly DiagramDocumentNodeInput[];
    links?: readonly DiagramDocumentLinkInput[];
    metadata?: JsonObject;
}
