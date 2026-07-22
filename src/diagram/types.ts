import type { JsonObject } from '../core/model.js';

// Core data model — node/port catalog (palette) and the live diagram (DiagramNode + Link).
// Mirrors the contract described in WebTemp/task.txt.

export interface PortTypeInit {
    name: string;
    color: string;
}

export class PortType {
    readonly name: string;
    readonly color: string;

    constructor(init: PortTypeInit) {
        this.name = init.name;
        this.color = init.color;
    }
}

export interface PortInit {
    id: string;
    name: string;
    description?: string;
    type?: string;
    maxLinks?: number;
    /// Whitelist of socket-type names this port also accepts beyond its
    /// declared <c>type</c> (input ports only). Empty = strict on <c>type</c>.
    availableTypes?: string[];
    /// True when this port can be added/removed at runtime on a node.
    isDynamic?: boolean;
    /// "" / "manual" / "onConnect" — see PalettePortDto.dynamicMode docs.
    dynamicMode?: string;
    /// True when this port was spawned by the grow-on-connect pipeline.
    /// Distinguishes anchor + runtime siblings on save (only siblings are
    /// persisted in the diagram blob; anchors come from the palette schema).
    isSibling?: boolean;
}

export class Port {
    id: string;
    name: string;
    description: string;
    type: string;
    maxLinks: number;
    availableTypes: string[];
    isDynamic: boolean;
    dynamicMode: string;
    isSibling: boolean;

    constructor(init: PortInit) {
        this.id = init.id;
        this.name = init.name;
        this.description = init.description ?? '';
        this.type = init.type ?? '';
        this.maxLinks = typeof init.maxLinks === 'number' ? init.maxLinks : 0;
        this.availableTypes = init.availableTypes ?? [];
        this.isDynamic = init.isDynamic ?? false;
        this.dynamicMode = init.dynamicMode ?? '';
        this.isSibling = init.isSibling ?? false;
    }

    clone(): Port {
        return new Port({
            id: this.id,
            name: this.name,
            description: this.description,
            type: this.type,
            maxLinks: this.maxLinks,
            availableTypes: [...this.availableTypes],
            isDynamic: this.isDynamic,
            dynamicMode: this.dynamicMode,
            isSibling: this.isSibling,
        });
    }
}

/// Element parameter schema — mirrors PaletteParameterDto on the wire.
/// Lives on the palette catalog so the Properties panel can render typed
/// editors per element; node-side values live in DiagramNode.parameters.
export interface ParamSchema {
    name: string;
    displayName: string;
    description: string;
    /// 'number' | 'bool' | 'string' | 'enum' | 'timespan' | 'datetime' | 'datatype' | …
    /// (anything else falls back to a text input on the Properties panel)
    type: string;
    defaultValue: string;
    options: string[];
    min: number | null;
    max: number | null;
    displayOrder: number;
    /// Section header in the Properties panel. Mirrors DisplayAttribute.GroupName
    /// from Diagram.Core. Empty → "General".
    category: string;
    /// SetBasic(true) on the desktop param. Basic ones surface above the fold;
    /// advanced ones live below a collapsible divider.
    isBasic: boolean;
    /// Optional editor hint from EditorAttribute (e.g. "ICandleDataTypeEditor").
    /// Empty string when none — the type-driven default editor takes over.
    editorType: string;
}

export interface NodeInit {
    id: string;
    name: string;
    description?: string;
    groupName?: string;
    inPorts?: Array<Port | PortInit>;
    outPorts?: Array<Port | PortInit>;
    icon?: string;
    parameters?: ParamSchema[];
    /// Non-empty host action enables double-click tracking for this node type.
    /// The component emits nodeOpen; the host decides what the action means.
    openAction?: string;
}

export class Node {
    id: string;
    name: string;
    description: string;
    groupName: string;
    inPorts: Port[];
    outPorts: Port[];
    icon: string;
    parameters: ParamSchema[];
    openAction: string;

    constructor(init: NodeInit) {
        this.id = init.id;
        this.name = init.name;
        this.description = init.description ?? '';
        this.groupName = init.groupName ?? 'Common';
        this.inPorts = (init.inPorts ?? []).map((p) => (p instanceof Port ? p : new Port(p)));
        this.outPorts = (init.outPorts ?? []).map((p) => (p instanceof Port ? p : new Port(p)));
        this.icon = init.icon ?? '';
        this.parameters = init.parameters ?? [];
        this.openAction = init.openAction ?? '';
    }

    clone(): Node {
        return new Node({
            id: this.id,
            name: this.name,
            description: this.description,
            groupName: this.groupName,
            inPorts: this.inPorts.map((p) => p.clone()),
            outPorts: this.outPorts.map((p) => p.clone()),
            icon: this.icon,
            parameters: this.parameters.map((p) => ({ ...p, options: [...p.options] })),
            openAction: this.openAction,
        });
    }
}

export interface DiagramNodeInit extends NodeInit {
    typeId?: string;     // palette element this instance was spawned from (kept for save round-trip)
    x?: number;
    y?: number;
    color?: string;
    border?: string;
    /// Error restored with the scheme. It is rendered as a red node background
    /// and exposed as the node tooltip by the canvas runtime.
    message?: string;
    /// Runtime-only flag — `true` for the red "missing from palette"
    /// placeholder. Never persisted: toDiagramPayload skips color/border/
    /// message for placeholders so a missing-palette state can't get
    /// frozen into the saved blob or local draft.
    isPlaceholder?: boolean;
    /// Per-instance values for the element's parameters, keyed by
    /// ParamSchema.name. Missing entries fall back to the schema's
    /// defaultValue when the Properties panel renders.
    paramValues?: Record<string, string>;
}

export class DiagramNode extends Node {
    typeId: string;      // palette TypeId — used to look up rendering data on save/load
    x: number;
    y: number;
    color: string;
    border: string;
    message: string;
    isPlaceholder: boolean;
    paramValues: Record<string, string>;

    constructor(init: DiagramNodeInit) {
        super(init);
        // Default to the palette element id so existing call sites that
        // forget to pass typeId still round-trip cleanly.
        this.typeId = init.typeId ?? init.id;
        this.x = typeof init.x === 'number' ? init.x : 0;
        this.y = typeof init.y === 'number' ? init.y : 0;
        this.color = init.color ?? '#d7d7d7';
        this.border = init.border ?? '#8c8c8c';
        this.message = init.message ?? '';
        this.isPlaceholder = init.isPlaceholder ?? false;
        this.paramValues = init.paramValues ?? {};
    }

    override clone(): DiagramNode {
        return new DiagramNode({
            id: this.id,
            typeId: this.typeId,
            name: this.name,
            description: this.description,
            groupName: this.groupName,
            inPorts: this.inPorts.map((p) => p.clone()),
            outPorts: this.outPorts.map((p) => p.clone()),
            icon: this.icon,
            x: this.x,
            y: this.y,
            color: this.color,
            border: this.border,
            message: this.message,
            openAction: this.openAction,
            isPlaceholder: this.isPlaceholder,
            paramValues: { ...this.paramValues },
            parameters: this.parameters.map((p) => ({ ...p, options: [...p.options] })),
        });
    }
}

export type LinkEndpoint = string | { id: string };

export interface LinkInit {
    id?: string;
    outNode: LinkEndpoint;
    outPort: LinkEndpoint;
    inNode: LinkEndpoint;
    inPort: LinkEndpoint;
    metadata?: JsonObject;
}

export class Link {
    id: string;
    outNode: LinkEndpoint;
    outPort: LinkEndpoint;
    inNode: LinkEndpoint;
    inPort: LinkEndpoint;
    metadata: JsonObject;

    constructor(init: LinkInit) {
        this.id = init.id ?? '';
        this.outNode = init.outNode;
        this.outPort = init.outPort;
        this.inNode = init.inNode;
        this.inPort = init.inPort;
        this.metadata = init.metadata ?? {};
    }
}

export type PortDirection = 'in' | 'out';

// Internal data shape stored in the diagram-engine GraphLinksModel.
// Kept separate from public Port/DiagramNode to avoid coupling rendering details to the API.
export interface PortData {
    id: string;
    name: string;
    description: string;
    type: string;
    maxLinks: number;
    direction: PortDirection;
    /// Whitelist of socket-type names accepted in addition to <c>type</c>.
    /// Mirrors Port.availableTypes — needed at link-time on the diagram side.
    availableTypes?: string[];
    /// Dynamic-port flag (Diagram.Core parity). When combined with
    /// <c>dynamicMode === 'onConnect'</c>, the anchor port spawns a sibling
    /// on each link drop and the link is rerouted to the sibling.
    isDynamic?: boolean;
    dynamicMode?: string;
    /// True when this port was spawned by the dynamic-growth pipeline rather
    /// than declared on the palette element. Persists in the diagram blob so
    /// reload restores the same set of sibling sockets.
    isSibling?: boolean;
}

export interface NodeData {
    id: string;
    typeId: string;
    name: string;
    description: string;
    groupName: string;
    inPorts: PortData[];
    outPorts: PortData[];
    icon: string;
    color: string;
    border: string;
    message: string;
    /// Runtime-only — see DiagramNode.isPlaceholder. Carried on the
    /// diagram model so save() can omit color/border/message for
    /// missing-palette nodes instead of freezing the red-state into
    /// the persisted blob.
    isPlaceholder?: boolean;
    loc: string;
    /// Non-empty double-click action copied from the catalog. The action is
    /// interpreted by the host application through the nodeOpen event.
    openAction?: string;
    /// Per-element parameter schema snapshot (sourced from the palette at
    /// drop/load time). Lives on the diagram model so the Properties panel
    /// can render typed editors without a catalog round-trip every time
    /// the user clicks a node.
    parameters?: ParamSchema[];
    /// Per-instance overrides for those parameters, keyed by ParamSchema.name.
    paramValues?: Record<string, string>;
}

export interface LinkData {
    from: string;
    fromPort: string;
    to: string;
    toPort: string;
}

export interface PaletteNodeData {
    id: string;
    name: string;
    description: string;
    group: string;
    icon: string;
    inPorts: PortData[];
    outPorts: PortData[];
    visible: boolean;
}

export interface PaletteGroupData {
    id: string;
    name: string;
    isGroup: true;
    expanded: boolean;
    visible: boolean;
}
