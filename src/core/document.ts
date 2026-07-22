import {
    DIAGRAM_DOCUMENT_VERSION,
    type DiagramDocument,
    type DiagramDocumentEndpoint,
    type DiagramDocumentInput,
    type DiagramDocumentLink,
    type DiagramDocumentLinkInput,
    type DiagramDocumentNode,
    type DiagramDocumentNodeInput,
    type DiagramDocumentPort,
    type DiagramDocumentPortInput,
    type DiagramParameterSchema,
    type JsonObject,
    type JsonValue,
} from './model.js';

export { DIAGRAM_DOCUMENT_VERSION } from './model.js';
export type {
    DiagramDocument,
    DiagramDocumentEndpoint,
    DiagramDocumentInput,
    DiagramDocumentLink,
    DiagramDocumentLinkInput,
    DiagramDocumentNode,
    DiagramDocumentNodeInput,
    DiagramDocumentPort,
    DiagramDocumentPortInput,
    DiagramDocumentVersion,
    DiagramParameterSchema,
    JsonObject,
    JsonPrimitive,
    JsonValue,
} from './model.js';

export class DiagramDocumentError extends Error {
    constructor(message: string, readonly path: string = '$') {
        super(`${path}: ${message}`);
        this.name = 'DiagramDocumentError';
    }
}

export function createDiagramDocument(input: DiagramDocumentInput = {}): DiagramDocument {
    const nodes = (input.nodes ?? []).map((node, index) => normalizeNode(node, `$.nodes[${index}]`));
    const usedLinkIds = new Set<string>();

    for (let index = 0; index < (input.links ?? []).length; index++) {
        const id = input.links?.[index].id;
        if (id === undefined) continue;
        requireIdentifier(id, `$.links[${index}].id`);
        if (usedLinkIds.has(id)) {
            throw new DiagramDocumentError(`duplicate link id "${id}"`, `$.links[${index}].id`);
        }
        usedLinkIds.add(id);
    }

    let sequence = 1;
    const links = (input.links ?? []).map((link, index) => {
        let id = link.id;
        if (id === undefined) {
            do id = `link_${sequence++}`;
            while (usedLinkIds.has(id));
            usedLinkIds.add(id);
        }
        return normalizeLink({ ...link, id }, `$.links[${index}]`);
    });
    const document: DiagramDocument = {
        version: DIAGRAM_DOCUMENT_VERSION,
        nodes,
        links,
        metadata: cloneJsonObject(input.metadata ?? {}, '$.metadata'),
    };
    validateDocument(document);
    return document;
}

export function cloneDiagramDocument(document: DiagramDocument): DiagramDocument {
    return parseDiagramDocument(document);
}

export function serializeDiagramDocument(document: DiagramDocument, space?: number): string {
    return JSON.stringify(parseDiagramDocument(document), null, space);
}

export function parseDiagramDocument(source: string | unknown): DiagramDocument {
    let value: unknown = source;
    if (typeof source === 'string') {
        try {
            value = JSON.parse(source) as unknown;
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'invalid JSON';
            throw new DiagramDocumentError(reason);
        }
    }

    const root = requireObject(value, '$');
    const version = requireNumber(root.version, '$.version');
    if (version !== DIAGRAM_DOCUMENT_VERSION) {
        throw new DiagramDocumentError(`unsupported document version ${version}`, '$.version');
    }
    const document: DiagramDocument = {
        version: DIAGRAM_DOCUMENT_VERSION,
        nodes: requireArray(root.nodes, '$.nodes').map((node, index) => parseNode(node, `$.nodes[${index}]`)),
        links: requireArray(root.links, '$.links').map((link, index) => parseLink(link, `$.links[${index}]`)),
        metadata: cloneJsonObject(root.metadata, '$.metadata'),
    };
    validateDocument(document);
    return document;
}

function normalizeNode(input: DiagramDocumentNodeInput, path: string): DiagramDocumentNode {
    const id = requireIdentifier(input.id, `${path}.id`);
    return {
        id,
        typeId: requireIdentifier(input.typeId ?? id, `${path}.typeId`),
        name: requireString(input.name, `${path}.name`),
        description: requireString(input.description ?? '', `${path}.description`),
        groupName: requireString(input.groupName ?? 'Common', `${path}.groupName`),
        x: requireFiniteNumber(input.x ?? 0, `${path}.x`),
        y: requireFiniteNumber(input.y ?? 0, `${path}.y`),
        color: requireString(input.color ?? '#d7d7d7', `${path}.color`),
        border: requireString(input.border ?? '#8c8c8c', `${path}.border`),
        icon: requireString(input.icon ?? '', `${path}.icon`),
        message: requireString(input.message ?? '', `${path}.message`),
        openAction: requireString(input.openAction ?? '', `${path}.openAction`),
        inPorts: (input.inPorts ?? []).map((port, index) => normalizePort(port, `${path}.inPorts[${index}]`)),
        outPorts: (input.outPorts ?? []).map((port, index) => normalizePort(port, `${path}.outPorts[${index}]`)),
        parameters: (input.parameters ?? []).map((parameter, index) => normalizeParameter(parameter, `${path}.parameters[${index}]`)),
        paramValues: cloneStringRecord(input.paramValues ?? {}, `${path}.paramValues`),
        metadata: cloneJsonObject(input.metadata ?? {}, `${path}.metadata`),
    };
}

function normalizePort(input: DiagramDocumentPortInput, path: string): DiagramDocumentPort {
    return {
        id: requireIdentifier(input.id, `${path}.id`),
        name: requireString(input.name, `${path}.name`),
        description: requireString(input.description ?? '', `${path}.description`),
        type: requireString(input.type ?? '', `${path}.type`),
        maxLinks: requireNonNegativeInteger(input.maxLinks ?? 0, `${path}.maxLinks`),
        availableTypes: (input.availableTypes ?? []).map((type, index) => requireString(type, `${path}.availableTypes[${index}]`)),
        isDynamic: requireBoolean(input.isDynamic ?? false, `${path}.isDynamic`),
        dynamicMode: requireString(input.dynamicMode ?? '', `${path}.dynamicMode`),
        isSibling: requireBoolean(input.isSibling ?? false, `${path}.isSibling`),
        metadata: cloneJsonObject(input.metadata ?? {}, `${path}.metadata`),
    };
}

function normalizeParameter(input: DiagramParameterSchema, path: string): DiagramParameterSchema {
    return {
        name: requireIdentifier(input.name, `${path}.name`),
        displayName: requireString(input.displayName, `${path}.displayName`),
        description: requireString(input.description, `${path}.description`),
        type: requireString(input.type, `${path}.type`),
        defaultValue: requireString(input.defaultValue, `${path}.defaultValue`),
        options: requireArray(input.options, `${path}.options`).map((option, index) => requireString(option, `${path}.options[${index}]`)),
        min: requireNullableFiniteNumber(input.min, `${path}.min`),
        max: requireNullableFiniteNumber(input.max, `${path}.max`),
        displayOrder: requireFiniteNumber(input.displayOrder, `${path}.displayOrder`),
        category: requireString(input.category, `${path}.category`),
        isBasic: requireBoolean(input.isBasic, `${path}.isBasic`),
        editorType: requireString(input.editorType, `${path}.editorType`),
    };
}

function normalizeLink(input: DiagramDocumentLinkInput & { id: string }, path: string): DiagramDocumentLink {
    return {
        id: requireIdentifier(input.id, `${path}.id`),
        from: normalizeEndpoint(input.from, `${path}.from`),
        to: normalizeEndpoint(input.to, `${path}.to`),
        metadata: cloneJsonObject(input.metadata ?? {}, `${path}.metadata`),
    };
}

function normalizeEndpoint(input: DiagramDocumentEndpoint, path: string): DiagramDocumentEndpoint {
    return {
        nodeId: requireIdentifier(input.nodeId, `${path}.nodeId`),
        portId: requireIdentifier(input.portId, `${path}.portId`),
    };
}

function parseNode(value: unknown, path: string): DiagramDocumentNode {
    const node = requireObject(value, path);
    return normalizeNode({
        id: requireString(node.id, `${path}.id`),
        typeId: requireString(node.typeId, `${path}.typeId`),
        name: requireString(node.name, `${path}.name`),
        description: requireString(node.description, `${path}.description`),
        groupName: requireString(node.groupName, `${path}.groupName`),
        x: requireNumber(node.x, `${path}.x`),
        y: requireNumber(node.y, `${path}.y`),
        color: requireString(node.color, `${path}.color`),
        border: requireString(node.border, `${path}.border`),
        icon: requireString(node.icon, `${path}.icon`),
        message: requireString(node.message, `${path}.message`),
        openAction: requireString(node.openAction, `${path}.openAction`),
        inPorts: requireArray(node.inPorts, `${path}.inPorts`).map((port, index) => parsePort(port, `${path}.inPorts[${index}]`)),
        outPorts: requireArray(node.outPorts, `${path}.outPorts`).map((port, index) => parsePort(port, `${path}.outPorts[${index}]`)),
        parameters: requireArray(node.parameters, `${path}.parameters`).map((parameter, index) => parseParameter(parameter, `${path}.parameters[${index}]`)),
        paramValues: cloneStringRecord(node.paramValues, `${path}.paramValues`),
        metadata: cloneJsonObject(node.metadata, `${path}.metadata`),
    }, path);
}

function parsePort(value: unknown, path: string): DiagramDocumentPort {
    const port = requireObject(value, path);
    return normalizePort({
        id: requireString(port.id, `${path}.id`),
        name: requireString(port.name, `${path}.name`),
        description: requireString(port.description, `${path}.description`),
        type: requireString(port.type, `${path}.type`),
        maxLinks: requireNumber(port.maxLinks, `${path}.maxLinks`),
        availableTypes: requireArray(port.availableTypes, `${path}.availableTypes`).map((type, index) => requireString(type, `${path}.availableTypes[${index}]`)),
        isDynamic: requireBoolean(port.isDynamic, `${path}.isDynamic`),
        dynamicMode: requireString(port.dynamicMode, `${path}.dynamicMode`),
        isSibling: requireBoolean(port.isSibling, `${path}.isSibling`),
        metadata: cloneJsonObject(port.metadata, `${path}.metadata`),
    }, path);
}

function parseParameter(value: unknown, path: string): DiagramParameterSchema {
    const parameter = requireObject(value, path);
    return normalizeParameter({
        name: requireString(parameter.name, `${path}.name`),
        displayName: requireString(parameter.displayName, `${path}.displayName`),
        description: requireString(parameter.description, `${path}.description`),
        type: requireString(parameter.type, `${path}.type`),
        defaultValue: requireString(parameter.defaultValue, `${path}.defaultValue`),
        options: requireArray(parameter.options, `${path}.options`).map((option, index) => requireString(option, `${path}.options[${index}]`)),
        min: requireNullableFiniteNumber(parameter.min, `${path}.min`),
        max: requireNullableFiniteNumber(parameter.max, `${path}.max`),
        displayOrder: requireNumber(parameter.displayOrder, `${path}.displayOrder`),
        category: requireString(parameter.category, `${path}.category`),
        isBasic: requireBoolean(parameter.isBasic, `${path}.isBasic`),
        editorType: requireString(parameter.editorType, `${path}.editorType`),
    }, path);
}

function parseLink(value: unknown, path: string): DiagramDocumentLink {
    const link = requireObject(value, path);
    return normalizeLink({
        id: requireString(link.id, `${path}.id`),
        from: parseEndpoint(link.from, `${path}.from`),
        to: parseEndpoint(link.to, `${path}.to`),
        metadata: cloneJsonObject(link.metadata, `${path}.metadata`),
    }, path);
}

function parseEndpoint(value: unknown, path: string): DiagramDocumentEndpoint {
    const endpoint = requireObject(value, path);
    return {
        nodeId: requireIdentifier(endpoint.nodeId, `${path}.nodeId`),
        portId: requireIdentifier(endpoint.portId, `${path}.portId`),
    };
}

function validateDocument(document: DiagramDocument): void {
    const nodes = new Map<string, DiagramDocumentNode>();
    for (let index = 0; index < document.nodes.length; index++) {
        const node = document.nodes[index];
        if (nodes.has(node.id)) throw new DiagramDocumentError(`duplicate node id "${node.id}"`, `$.nodes[${index}].id`);
        validateUniquePorts(node.inPorts, `$.nodes[${index}].inPorts`);
        validateUniquePorts(node.outPorts, `$.nodes[${index}].outPorts`);
        nodes.set(node.id, node);
    }

    const linkIds = new Set<string>();
    const endpoints = new Set<string>();
    for (let index = 0; index < document.links.length; index++) {
        const link = document.links[index];
        const path = `$.links[${index}]`;
        if (linkIds.has(link.id)) throw new DiagramDocumentError(`duplicate link id "${link.id}"`, `${path}.id`);
        linkIds.add(link.id);
        const fromNode = nodes.get(link.from.nodeId);
        const toNode = nodes.get(link.to.nodeId);
        if (fromNode === undefined) throw new DiagramDocumentError(`unknown source node "${link.from.nodeId}"`, `${path}.from.nodeId`);
        if (toNode === undefined) throw new DiagramDocumentError(`unknown target node "${link.to.nodeId}"`, `${path}.to.nodeId`);
        if (!fromNode.outPorts.some((port) => port.id === link.from.portId)) {
            throw new DiagramDocumentError(`unknown output port "${link.from.portId}"`, `${path}.from.portId`);
        }
        if (!toNode.inPorts.some((port) => port.id === link.to.portId)) {
            throw new DiagramDocumentError(`unknown input port "${link.to.portId}"`, `${path}.to.portId`);
        }
        const key = `${link.from.nodeId}\u0000${link.from.portId}\u0000${link.to.nodeId}\u0000${link.to.portId}`;
        if (endpoints.has(key)) throw new DiagramDocumentError('duplicate link endpoints', path);
        endpoints.add(key);
    }
}

function validateUniquePorts(ports: readonly DiagramDocumentPort[], path: string): void {
    const ids = new Set<string>();
    for (let index = 0; index < ports.length; index++) {
        const id = ports[index].id;
        if (ids.has(id)) throw new DiagramDocumentError(`duplicate port id "${id}"`, `${path}[${index}].id`);
        ids.add(id);
    }
}

function cloneStringRecord(value: unknown, path: string): Record<string, string> {
    const object = requireObject(value, path);
    const result: Record<string, string> = {};
    for (const [key, item] of Object.entries(object)) result[key] = requireString(item, `${path}.${key}`);
    return result;
}

function cloneJsonObject(value: unknown, path: string, ancestors = new WeakSet<object>()): JsonObject {
    const object = requireObject(value, path);
    if (ancestors.has(object)) throw new DiagramDocumentError('circular JSON value', path);
    ancestors.add(object);
    const result: JsonObject = {};
    try {
        for (const [key, item] of Object.entries(object)) {
            result[key] = cloneJsonValue(item, `${path}.${key}`, ancestors);
        }
    } finally {
        ancestors.delete(object);
    }
    return result;
}

function cloneJsonValue(value: unknown, path: string, ancestors: WeakSet<object>): JsonValue {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return requireFiniteNumber(value, path);
    if (Array.isArray(value)) {
        if (ancestors.has(value)) throw new DiagramDocumentError('circular JSON value', path);
        ancestors.add(value);
        try {
            return value.map((item, index) => cloneJsonValue(item, `${path}[${index}]`, ancestors));
        } finally {
            ancestors.delete(value);
        }
    }
    if (isObject(value)) return cloneJsonObject(value, path, ancestors);
    throw new DiagramDocumentError('expected a JSON value', path);
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
    if (!isObject(value)) throw new DiagramDocumentError('expected an object', path);
    return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value) as object | null;
    return prototype === Object.prototype || prototype === null;
}

function requireArray(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) throw new DiagramDocumentError('expected an array', path);
    return value;
}

function requireString(value: unknown, path: string): string {
    if (typeof value !== 'string') throw new DiagramDocumentError('expected a string', path);
    return value;
}

function requireIdentifier(value: unknown, path: string): string {
    const id = requireString(value, path);
    if (id.trim().length === 0) throw new DiagramDocumentError('identifier cannot be empty', path);
    return id;
}

function requireNumber(value: unknown, path: string): number {
    if (typeof value !== 'number') throw new DiagramDocumentError('expected a number', path);
    return value;
}

function requireFiniteNumber(value: unknown, path: string): number {
    const number = requireNumber(value, path);
    if (!Number.isFinite(number)) throw new DiagramDocumentError('expected a finite number', path);
    return number;
}

function requireNullableFiniteNumber(value: unknown, path: string): number | null {
    return value === null ? null : requireFiniteNumber(value, path);
}

function requireNonNegativeInteger(value: unknown, path: string): number {
    const number = requireFiniteNumber(value, path);
    if (!Number.isInteger(number) || number < 0) throw new DiagramDocumentError('expected a non-negative integer', path);
    return number;
}

function requireBoolean(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') throw new DiagramDocumentError('expected a boolean', path);
    return value;
}
