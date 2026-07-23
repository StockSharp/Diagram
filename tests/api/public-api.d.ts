// FILE: canvas-renderer.d.ts
import type { DiagramDocument, DiagramParameterSchema, JsonObject } from './core/model.js';
import type { DiagramGlobalErrorKind, DiagramInteractionPermissions, DiagramPortRuntimeState, DiagramRuntimeState, DiagramSelection, DiagramViewState } from './core/state.js';
export type PortDirection = 'in' | 'out';
export type PortClickAction = 'leftClick' | 'rightClick';
export interface PortInit {
    id: string;
    name: string;
    description?: string;
    type?: string;
    maxLinks?: number;
    availableTypes?: string[];
    isDynamic?: boolean;
    dynamicMode?: string;
    isSibling?: boolean;
    metadata?: JsonObject;
}
/** Mutable port properties. Port identity and direction remain stable. */
export type PortUpdate = Partial<Omit<PortInit, 'id'>>;
export interface DiagramNodeInit {
    id?: string;
    typeId?: string;
    name: string;
    description?: string;
    groupName?: string;
    color?: string;
    border?: string;
    icon?: string;
    x?: number;
    y?: number;
    inPorts?: PortInit[];
    outPorts?: PortInit[];
    /** Non-empty host action enables node double-click tracking. */
    openAction?: string;
    /** Transient error discovered while loading a scheme. */
    loadError?: string;
    /** Persistent host text. Runtime/load errors are stored separately. */
    message?: string;
    parameters?: DiagramParameterSchema[];
    paramValues?: Record<string, string>;
    metadata?: JsonObject;
    /** Transient missing-catalog marker; excluded from saveDocument(). */
    isPlaceholder?: boolean;
}
export interface LinkInit {
    id?: string;
    from: string;
    fromPort: string;
    to: string;
    toPort: string;
    metadata?: JsonObject;
}
export type DiagramNodeSnapshot = DiagramNodeInit & Required<Pick<DiagramNodeInit, 'id' | 'typeId' | 'name' | 'color' | 'border' | 'x' | 'y'>> & {
    inPorts: PortInit[];
    outPorts: PortInit[];
};
export interface DiagramSnapshot {
    nodes: DiagramNodeSnapshot[];
    links: Array<Required<Pick<LinkInit, 'from' | 'fromPort' | 'to' | 'toPort'>>>;
}
export interface DiagramOptions {
    host: HTMLElement;
    background?: string;
    gridColor?: string;
    /** Snap dragged nodes to a world-space grid. Defaults to false for the low-level renderer. */
    gridSnap?: boolean;
    /** Positive world-space grid step. Defaults to 28. */
    gridSize?: number;
    /** Optional explicit socket-type → colour map; unknown types hash to a hue. */
    typeColors?: Record<string, string>;
    /** Ceiling (0..1) for link/socket colour lightness. Unset = full palette (tuned for a dark
     *  canvas). A light theme sets a low ceiling so the otherwise-light link colours darken enough
     *  to stay visible on a light canvas. */
    linkMaxLightness?: number;
    /** When true, colour links by their source socket type; the default draws links in the neutral grey. */
    typedLinkColors?: boolean;
    /** Optional minimap colours. When omitted they are derived from the
     *  current canvas background, so a normal light/dark theme switch also
     *  rethemes the overview. */
    overviewBackground?: string;
    overviewBorderColor?: string;
    overviewViewportColor?: string;
    overviewViewportFill?: string;
}
export type DiagramScreenshotScope = 'viewport' | 'content';
export interface DiagramScreenshotOptions {
    /** Current viewport (Charts/WPF parity) or the complete graph bounds. Defaults to viewport. */
    scope?: DiagramScreenshotScope;
    /** World-to-CSS-pixel scale for content export. Defaults to 1. */
    scale?: number;
    /** CSS-pixel padding around content export. Defaults to 32. */
    padding?: number;
    /** Output pixel density. Defaults to the renderer's current device pixel ratio. */
    pixelRatio?: number;
    /** Optional export-only background override. */
    background?: string;
    /** Defaults to true. */
    includeGrid?: boolean;
    /** Defaults to the current value for viewport and false for content. */
    includeOverview?: boolean;
    /** Defaults to true for viewport and false for content. */
    includeSelection?: boolean;
    /** Include debugger and error state. Defaults to true. */
    includeRuntimeState?: boolean;
}
export interface LinkValidatorArgs {
    fromNode: NodeModel;
    fromPort: PortModel;
    toNode: NodeModel;
    toPort: PortModel;
}
export type LinkValidator = (args: LinkValidatorArgs) => boolean;
export type LinkValidationReason = 'allowed' | 'missing-link' | 'missing-node' | 'missing-port' | 'same-node' | 'invalid-direction' | 'incompatible-type' | 'duplicate-link' | 'source-limit' | 'target-limit' | 'host-rejected';
export interface LinkValidationResult {
    allowed: boolean;
    reason: LinkValidationReason;
}
export type NodeErrorKind = 'runtime' | 'load';
export interface NodeErrorOptions {
    /** Runtime errors flash the border; load errors use a red background. */
    kind?: NodeErrorKind;
    /** Disable the initial runtime-error border flash. Defaults to true. */
    animate?: boolean;
}
export interface DiagramEvents {
    nodeAdded: {
        node: NodeModel;
    };
    nodeRemoved: {
        node: NodeModel;
    };
    nodeMoved: {
        node: NodeModel;
    };
    nodeChanged: {
        node: NodeModel;
    };
    nodeSelected: {
        node: NodeModel | null;
        selected: boolean;
    };
    nodeHover: {
        node: NodeModel;
        hovering: boolean;
    };
    linkAdded: {
        link: LinkModel;
    };
    linkRemoved: {
        link: LinkModel;
    };
    linkRelinked: {
        link: LinkModel;
        previous: LinkInit & {
            id: string;
        };
    };
    linkSelected: {
        link: LinkModel | null;
        selected: boolean;
    };
    linkHover: {
        link: LinkModel;
        hovering: boolean;
    };
    linkValidation: {
        fromNode: NodeModel;
        from: PortModel;
        toNode: NodeModel;
        to: PortModel;
        allowed: boolean;
        reason: LinkValidationReason;
    };
    portSelected: {
        node: NodeModel;
        port: PortModel;
    };
    portClicked: {
        node: NodeModel;
        port: PortModel;
        action: PortClickAction;
        ctrlKey: boolean;
        shiftKey: boolean;
        altKey: boolean;
        metaKey: boolean;
    };
    portHover: {
        node: NodeModel;
        port: PortModel;
        hovering: boolean;
    };
    nodeOpen: {
        node: NodeModel;
    };
    loadFinished: {
        nodes: NodeModel[];
        links: LinkModel[];
    };
    zoomChanged: {
        scale: number;
    };
    viewChanged: DiagramViewState;
    contextMenu: {
        x: number;
        y: number;
        link: LinkModel | null;
        node: NodeModel | null;
        port: {
            node: NodeModel;
            port: PortModel;
        } | null;
    };
    undoStackChanged: {
        canUndo: boolean;
        canRedo: boolean;
    };
    selectionChanged: DiagramSelection;
    runtimeStateChanged: {
        state: DiagramRuntimeState;
    };
}
type EvName = keyof DiagramEvents;
export declare class PortModel {
    id: string;
    name: string;
    description: string;
    type: string;
    direction: PortDirection;
    maxLinks: number;
    availableTypes: string[];
    isDynamic: boolean;
    dynamicMode: string;
    isSibling: boolean;
    metadata: JsonObject;
    cx: number;
    cy: number;
    constructor(init: PortInit, dir: PortDirection);
    toInit(): PortInit;
}
export declare class NodeModel {
    id: string;
    typeId: string;
    name: string;
    description: string;
    groupName: string;
    color: string;
    border: string;
    icon: string;
    openAction: string;
    message: string;
    parameters: DiagramParameterSchema[];
    paramValues: Record<string, string>;
    metadata: JsonObject;
    isPlaceholder: boolean;
    loadError: string;
    runtimeError: string;
    errorFlashStart: number | null;
    x: number;
    y: number;
    inPorts: PortModel[];
    outPorts: PortModel[];
    w: number;
    h: number;
    constructor(init: DiagramNodeInit, id: string);
    port(id: string): PortModel | undefined;
    toInit(includeRuntimeState?: boolean): DiagramNodeInit & {
        id: string;
    };
}
export declare class LinkModel {
    from: string;
    fromPort: string;
    to: string;
    toPort: string;
    readonly id: string;
    readonly metadata: JsonObject;
    constructor(from: string, fromPort: string, to: string, toPort: string, id?: string, metadata?: JsonObject);
    key(): string;
    toInit(): LinkInit & {
        id: string;
    };
}
export declare class Diagram {
    constructor(opts: DiagramOptions);
    on<K extends EvName>(ev: K, h: (p: DiagramEvents[K]) => void): () => void;
    setLinkValidator(fn: LinkValidator | null): void;
    setGridSnap(enabled: boolean, size?: number): void;
    getGridSnap(): {
        enabled: boolean;
        size: number;
    };
    addDiagramNode(init: DiagramNodeInit): string;
    removeDiagramNode(id: string): void;
    moveNode(id: string, x: number, y: number): void;
    nudgeSelection(dx: number, dy: number): boolean;
    addLink(init: LinkInit): boolean;
    removeLink(link: {
        id?: string;
        from: string;
        fromPort: string;
        to: string;
        toPort: string;
    }): void;
    canUndo(): boolean;
    canRedo(): boolean;
    undo(): void;
    redo(): void;
    cutSelection(): void;
    withTransaction<T>(label: string, fn: () => T): T;
    deleteSelection(): void;
    clear(): void;
    relink(linkId: string, next: Pick<LinkInit, 'from' | 'fromPort' | 'to' | 'toPort'>): LinkValidationResult;
    addPort(nodeId: string, direction: PortDirection, init: PortInit): boolean;
    removePort(nodeId: string, direction: PortDirection, portId: string): boolean;
    updatePortType(nodeId: string, direction: PortDirection, portId: string, type: string): boolean;
    updatePort(nodeId: string, direction: PortDirection, portId: string, patch: PortUpdate): boolean;
    setNodePorts(nodeId: string, inPorts: readonly PortInit[], outPorts: readonly PortInit[]): boolean;
    updateNode(nodeId: string, patch: Partial<Pick<DiagramNodeInit, 'name' | 'description' | 'color' | 'border' | 'message' | 'openAction'>>): boolean;
    setNodeParamValue(nodeId: string, name: string, value: string | undefined): boolean;
    setShowNodeMessages(show: boolean): void;
    load(nodes: DiagramNodeInit[], links: LinkInit[]): void;
    save(): DiagramSnapshot;
    loadDocument(source: DiagramDocument | string): void;
    saveDocument(): DiagramDocument;
    selectedNodeId(): string | null;
    getSelection(): DiagramSelection;
    selectNodesById(ids: readonly string[]): void;
    selectLinkById(id: string | null): void;
    selectPortById(nodeId: string, direction: PortDirection, portId: string): void;
    getViewState(): DiagramViewState;
    setViewState(state: DiagramViewState): void;
    findNode(id: string): NodeModel | undefined;
    requestRedraw(): void;
    /**
     * Creates a detached canvas. With no options it is an exact copy of the
     * current frame, matching Charts.takeScreenshot(). Content scope renders
     * the whole graph without changing the visible viewport.
     */
    takeScreenshot(options?: DiagramScreenshotOptions): HTMLCanvasElement;
    getRuntimeState(): DiagramRuntimeState;
    setRuntimeState(state: DiagramRuntimeState): void;
    clearRuntimeState(): void;
    setActiveNode(nodeId: string | null): boolean;
    setPortRuntimeState(nodeId: string, direction: PortDirection, portId: string, patch: Partial<DiagramPortRuntimeState>): boolean;
    setGlobalError(message: string | null, kind?: DiagramGlobalErrorKind): void;
    setNodeError(id: string, message: string, options?: NodeErrorOptions): boolean;
    clearNodeError(id: string, kind?: NodeErrorKind): boolean;
    viewToWorld(sx: number, sy: number): [number, number];
    worldToView(wx: number, wy: number): [number, number];
    selectNodeById(id: string | null): void;
    setZoom(scale: number): void;
    zoomToFit(): void;
    playIntro(): void;
    setOverviewVisible(v: boolean): void;
    setTypeColors(colors: Readonly<Record<string, string>>): void;
    setTheme(t: {
        background?: string;
        gridColor?: string;
        linkMaxLightness?: number;
        typedLinkColors?: boolean;
        overviewBackground?: string;
        overviewBorderColor?: string;
        overviewViewportColor?: string;
        overviewViewportFill?: string;
    }): void;
    resize(w: number, h: number): void;
    getInteractionPermissions(): DiagramInteractionPermissions;
    setInteractionPermissions(patch: Partial<DiagramInteractionPermissions>): void;
    /** View-only mode keeps selection, inspection and copy enabled. */
    setReadOnly(value: boolean): void;
    destroy(): void;
    validateLink(init: Pick<LinkInit, 'from' | 'fromPort' | 'to' | 'toPort'>, excludeLinkId?: string): LinkValidationResult;
    copySelection(): void;
    copySelectionDocument(): DiagramDocument | null;
    hasClipboard(): boolean;
    getClipboardDocument(): DiagramDocument | null;
    setClipboardDocument(source: DiagramDocument | string): void;
    pasteSelection(): string[];
    pasteDocument(source: DiagramDocument | string, offset?: {
        x: number;
        y: number;
    }): string[];
}
export declare const version = "0.1.0";
export {};

// FILE: core/action-registry.d.ts
export interface DiagramAction<TId extends string, TContext> {
    readonly id: TId;
    canExecute(context: TContext): boolean;
    execute(context: TContext): void;
}
export interface DiagramActionState<TId extends string> {
    id: TId;
    enabled: boolean;
}
export declare class DiagramActionRegistry<TId extends string, TContext> {
    register(action: DiagramAction<TId, TContext>): () => void;
    get(id: TId): DiagramAction<TId, TContext> | null;
    states(context: TContext): DiagramActionState<TId>[];
    canExecute(id: TId, context: TContext): boolean;
    execute(id: TId, context: TContext): boolean;
}

// FILE: core/document.d.ts
import { type DiagramDocument, type DiagramDocumentInput } from './model.js';
export { DIAGRAM_DOCUMENT_VERSION } from './model.js';
export type { DiagramDocument, DiagramDocumentEndpoint, DiagramDocumentInput, DiagramDocumentLink, DiagramDocumentLinkInput, DiagramDocumentNode, DiagramDocumentNodeInput, DiagramDocumentPort, DiagramDocumentPortInput, DiagramDocumentVersion, DiagramParameterSchema, JsonObject, JsonPrimitive, JsonValue, } from './model.js';
export declare class DiagramDocumentError extends Error {
    readonly path: string;
    constructor(message: string, path?: string);
}
export declare function createDiagramDocument(input?: DiagramDocumentInput): DiagramDocument;
export declare function cloneDiagramDocument(document: DiagramDocument): DiagramDocument;
export declare function serializeDiagramDocument(document: DiagramDocument, space?: number): string;
export declare function parseDiagramDocument(source: string | unknown): DiagramDocument;

// FILE: core/history.d.ts
export interface DiagramCommand {
    readonly label: string;
    execute(): void;
    undo(): void;
}
export interface DiagramHistoryState {
    canUndo: boolean;
    canRedo: boolean;
    undoDepth: number;
    redoDepth: number;
    undoLabel: string | null;
    redoLabel: string | null;
}
export type DiagramHistoryListener = (state: DiagramHistoryState) => void;
export declare class DiagramCommandHistory {
    constructor(listener?: DiagramHistoryListener | undefined);
    get state(): DiagramHistoryState;
    execute(command: DiagramCommand): void;
    /** Records a gesture that already changed the document, such as pointer drag. */
    recordApplied(command: DiagramCommand): void;
    transaction<T>(label: string, action: () => T): T;
    undo(): boolean;
    redo(): boolean;
    clear(): void;
}

// FILE: core/model.d.ts
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
export declare const DIAGRAM_DOCUMENT_VERSION: 1;
export type DiagramDocumentVersion = typeof DIAGRAM_DOCUMENT_VERSION;
export interface DiagramDocument {
    version: DiagramDocumentVersion;
    nodes: DiagramDocumentNode[];
    links: DiagramDocumentLink[];
    metadata: JsonObject;
}
export type DiagramDocumentPortInput = Pick<DiagramDocumentPort, 'id' | 'name'> & Partial<Omit<DiagramDocumentPort, 'id' | 'name'>>;
export type DiagramDocumentNodeInput = Pick<DiagramDocumentNode, 'id' | 'name'> & Partial<Omit<DiagramDocumentNode, 'id' | 'name' | 'inPorts' | 'outPorts'>> & {
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

// FILE: core/state.d.ts
export type DiagramPortDirection = 'in' | 'out';
export type DiagramNodeErrorKind = 'runtime' | 'load';
export type DiagramGlobalErrorKind = 'invalid' | 'load' | 'locked' | 'encrypted';
export interface DiagramErrorState<TKind extends string> {
    kind: TKind;
    message: string;
    /** Incrementing this value requests a fresh renderer animation. */
    pulse: number;
}
export interface DiagramPortRuntimeState {
    active: boolean;
    selected: boolean;
    breakpoint: boolean;
    breakpointActive: boolean;
    value: string | null;
    error: string | null;
}
export interface DiagramNodePortRuntimeState {
    in: Record<string, DiagramPortRuntimeState>;
    out: Record<string, DiagramPortRuntimeState>;
}
export interface DiagramNodeRuntimeState {
    active: boolean;
    error: DiagramErrorState<DiagramNodeErrorKind> | null;
    ports: DiagramNodePortRuntimeState;
}
export interface DiagramRuntimeState {
    activeNodeId: string | null;
    nodes: Record<string, DiagramNodeRuntimeState>;
    globalError: DiagramErrorState<DiagramGlobalErrorKind> | null;
}
export interface DiagramViewState {
    zoom: number;
    panX: number;
    panY: number;
    overviewVisible: boolean;
}
export interface DiagramSelectedPort {
    nodeId: string;
    portId: string;
    direction: DiagramPortDirection;
}
export interface DiagramSelection {
    nodeIds: string[];
    linkIds: string[];
    port: DiagramSelectedPort | null;
    primaryNodeId: string | null;
    primaryLinkId: string | null;
}
export interface DiagramInteractionPermissions {
    select: boolean;
    inspect: boolean;
    copy: boolean;
    moveNodes: boolean;
    createLinks: boolean;
    deleteSelection: boolean;
    paste: boolean;
    history: boolean;
}
export declare function createDiagramRuntimeState(): DiagramRuntimeState;
export declare function cloneDiagramRuntimeState(state: DiagramRuntimeState): DiagramRuntimeState;
export declare function createDiagramViewState(): DiagramViewState;
export declare function createDiagramSelection(): DiagramSelection;
export declare function createDiagramPortRuntimeState(): DiagramPortRuntimeState;
export declare function createEditableDiagramPermissions(): DiagramInteractionPermissions;
export declare function createReadOnlyDiagramPermissions(): DiagramInteractionPermissions;
export declare function createDiagramNodeRuntimeState(): DiagramNodeRuntimeState;

// FILE: core/view-state.d.ts
import { type DiagramViewState } from './state.js';
export declare const DIAGRAM_VIEW_STATE_VERSION: 1;
export interface DiagramViewStateDocument {
    version: typeof DIAGRAM_VIEW_STATE_VERSION;
    view: DiagramViewState;
}
export declare class DiagramViewStateError extends Error {
    readonly path: string;
    constructor(message: string, path?: string);
}
export declare function createDiagramViewStateDocument(view?: DiagramViewState): DiagramViewStateDocument;
export declare function parseDiagramViewState(source: string | unknown): DiagramViewState;
export declare function serializeDiagramViewState(view: DiagramViewState, space?: number): string;

// FILE: diagram/api.d.ts
import type { DiagramDocument } from '../core/model.js';
import type { DiagramRuntimeState, DiagramSelection, DiagramViewState } from '../core/state.js';
import type { DiagramNode, Link, Port, PortDirection } from './types.js';
export interface DiagramOptions {
    div: HTMLElement;
    catalog: import('./catalog.js').StockSharpCatalog;
    /** Show the built-in top-right fullscreen request button. Defaults to true. */
    showFullscreenButton?: boolean;
    overviewContainer?: HTMLElement | null;
    zoomLabel?: HTMLElement | null;
    /** Optional system clipboard adapter. Pass null to force memory-only clipboard. */
    clipboard?: DiagramClipboard | null;
    /** Snap pointer-dragged nodes to the grid. Defaults to true. */
    gridSnap?: boolean;
    /** Positive world-space grid step. Defaults to 28. */
    gridSize?: number;
}
export interface DiagramGridSettings {
    enabled: boolean;
    size: number;
}
export interface DiagramPoint {
    x: number;
    y: number;
}
export interface DiagramNodeBounds extends DiagramPoint {
    width: number;
    height: number;
}
export type DiagramScreenshotScope = 'viewport' | 'content';
export interface DiagramScreenshotOptions {
    /** Current viewport or the complete graph bounds. Defaults to viewport. */
    scope?: DiagramScreenshotScope;
    /** World-to-CSS-pixel scale for content export. Defaults to 1. */
    scale?: number;
    /** CSS-pixel padding around content export. Defaults to 32. */
    padding?: number;
    /** Output pixel density. Defaults to the current device pixel ratio. */
    pixelRatio?: number;
    /** Optional export-only background override. */
    background?: string;
    /** Defaults to true. */
    includeGrid?: boolean;
    /** Defaults to the current value for viewport and false for content. */
    includeOverview?: boolean;
    /** Defaults to true for viewport and false for content. */
    includeSelection?: boolean;
    /** Include debugger and error state. Defaults to true. */
    includeRuntimeState?: boolean;
}
export interface DiagramClipboard {
    readText(): Promise<string>;
    writeText(value: string): Promise<void>;
}
export interface DiagramThemeOptions {
    diagramBackground?: string;
    overviewBackground?: string;
    gridColor?: string;
    linkMaxLightness?: number;
    /** When true, colour links by their source socket type; the default (false) draws every link in the
     *  neutral grey so a scheme reads uniformly. Sockets stay type-coloured either way. */
    typedLinkColors?: boolean;
    overviewBorderColor?: string;
    overviewViewportColor?: string;
    overviewViewportFill?: string;
}
export type NodeErrorKind = 'runtime' | 'load';
export interface NodeErrorOptions {
    kind?: NodeErrorKind;
    animate?: boolean;
}
export interface DiagramLoadOptions {
    /** Transient per-node errors discovered while restoring a scheme. */
    nodeErrors?: Readonly<Record<string, string>>;
}
export interface DocumentLoadFailedPayload {
    message: string;
    error: Error;
}
export interface FullscreenChangedPayload {
    fullscreen: boolean;
}
/** Requested host layout state. The component never enters fullscreen itself. */
export interface FullscreenRequestedPayload {
    fullscreen: boolean;
}
export type ContextCommand = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'open' | 'delete' | 'properties' | 'help';
export interface ContextCommandPayload {
    command: ContextCommand;
    nodes: DiagramNode[];
    links: Link[];
}
export interface ContextCommandState {
    command: ContextCommand;
    enabled: boolean;
}
export interface ContextMenuRequestedPayload {
    x: number;
    y: number;
    node: DiagramNode | null;
    link: Link | null;
    port: Port | null;
    portDirection: PortDirection | null;
    commands: ContextCommandState[];
}
export interface NodeSelectedPayload {
    node: DiagramNode;
    selected: boolean;
}
export interface NodeHoverPayload {
    node: DiagramNode;
    hovering: boolean;
}
export interface PortSelectedPayload {
    node: DiagramNode;
    port: Port;
    direction: PortDirection;
}
export interface PortHoverPayload extends PortSelectedPayload {
    hovering: boolean;
}
export type PortClickAction = 'leftClick' | 'rightClick';
export interface PortClickedPayload extends PortSelectedPayload {
    action: PortClickAction;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
}
export interface LinkSelectedPayload {
    link: Link;
    selected: boolean;
}
export interface LinkHoverPayload {
    link: Link;
    hovering: boolean;
}
export interface NodeMovedPayload {
    node: DiagramNode;
}
export interface NodeChangePayload {
    nodes: DiagramNode[];
}
export interface LinkChangePayload {
    links: Link[];
}
export interface LinkRelinkedPayload {
    link: Link;
    previous: Link;
}
export interface LoadFinishedPayload {
    nodes: DiagramNode[];
    links: Link[];
}
export interface LinkValidationPayload {
    fromNode: DiagramNode;
    fromPort: Port;
    toNode: DiagramNode;
    toPort: Port;
    allowed: boolean;
    reason: LinkValidationReason;
}
export type LinkValidationReason = 'allowed' | 'missing-link' | 'missing-node' | 'missing-port' | 'same-node' | 'invalid-direction' | 'incompatible-type' | 'duplicate-link' | 'source-limit' | 'target-limit' | 'host-rejected';
export interface LinkValidationResult {
    allowed: boolean;
    reason: LinkValidationReason;
}
export interface LinkValidatorArgs {
    fromNode: DiagramNode;
    fromPort: Port;
    toNode: DiagramNode;
    toPort: Port;
}
export type LinkValidator = (args: LinkValidatorArgs) => boolean;
export interface DiagramEvents extends Record<string, unknown> {
    nodeAdded: NodeChangePayload;
    nodeRemoved: NodeChangePayload;
    linkAdded: LinkChangePayload;
    linkRemoved: LinkChangePayload;
    linkRelinked: LinkRelinkedPayload;
    nodeMoved: NodeMovedPayload;
    nodeSelected: NodeSelectedPayload;
    nodeHover: NodeHoverPayload;
    portSelected: PortSelectedPayload;
    portClicked: PortClickedPayload;
    portHover: PortHoverPayload;
    linkSelected: LinkSelectedPayload;
    linkHover: LinkHoverPayload;
    linkValidation: LinkValidationPayload;
    loadFinished: LoadFinishedPayload;
    contextCommand: ContextCommandPayload;
    contextMenuRequested: ContextMenuRequestedPayload;
    undoRequested: NodeChangePayload & LinkChangePayload;
    redoRequested: NodeChangePayload & LinkChangePayload;
    nodeEdit: NodeChangePayload;
    nodeProperties: NodeChangePayload;
    nodeOpen: NodeChangePayload;
    nodeHelp: NodeChangePayload;
    zoomChanged: DiagramViewState;
    viewChanged: DiagramViewState;
    selectionChanged: DiagramSelection;
    runtimeStateChanged: {
        state: DiagramRuntimeState;
    };
    undoStackChanged: {
        canUndo: boolean;
        canRedo: boolean;
    };
    documentLoaded: {
        document: DiagramDocument;
    };
    documentLoadFailed: DocumentLoadFailedPayload;
    fullscreenRequested: FullscreenRequestedPayload;
    fullscreenChanged: FullscreenChangedPayload;
}

// FILE: diagram/catalog.d.ts
import { EventEmitter } from './event-emitter.js';
import { Node, NodeInit, PortType, PortTypeInit } from './types.js';
export interface CatalogEvents extends Record<string, unknown> {
    portTypesChanged: PortType[];
    nodeTypesChanged: Node[];
}
export declare class StockSharpCatalog extends EventEmitter<CatalogEvents> {
    addPortType(portType: PortType | PortTypeInit): void;
    removePortType(name: string): void;
    getPortType(name: string): PortType | null;
    getPortTypes(): PortType[];
    addNodeType(node: Node | NodeInit): void;
    removeNodeType(id: string): void;
    getNodeType(id: string): Node | null;
    getNodeTypes(): Node[];
}

// FILE: diagram/event-emitter.d.ts
export type EventHandler<T> = (payload: T) => void;
export declare class EventEmitter<TEvents extends Record<string, unknown>> {
    on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): () => void;
    off<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void;
    protected emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void;
    protected clearEventHandlers(): void;
}

// FILE: diagram/palette.d.ts
import { EventEmitter } from './event-emitter.js';
import { StockSharpCatalog } from './catalog.js';
import { Node } from './types.js';
export interface PaletteOptions {
    div: HTMLElement;
    catalog: StockSharpCatalog;
    /** Node type ids hidden from this palette. Matching is case-insensitive. */
    excludedTypeIds?: Iterable<string>;
}
export interface PaletteNodePayload {
    node: Node;
}
export interface PaletteSelectionChangedPayload {
    node: Node | null;
}
export interface PaletteContextMenuPayload extends PaletteNodePayload {
    x: number;
    y: number;
}
export interface PaletteEvents extends Record<string, unknown> {
    selectionChanged: PaletteSelectionChangedPayload;
    nodeActivated: PaletteNodePayload;
    contextMenuRequested: PaletteContextMenuPayload;
}
/** Typed payload used by native drag-and-drop between the palette and canvas. */
export declare const PALETTE_DRAG_MIME = "application/x-stocksharp-node";
/**
 * Accessible HTML palette for catalog node types.
 *
 * The component owns the contents of `div`. The host decides what activation
 * and context-menu actions mean by subscribing to the typed events.
 */
export declare class StockSharpPalette extends EventEmitter<PaletteEvents> {
    constructor({ div, catalog, excludedTypeIds }: PaletteOptions);
    setFilter(text: string): void;
    collapseAll(): void;
    expandAll(): void;
    /** Replaces the WPF palette's dynamic ExcludedTypeIds set. */
    setExcludedTypeIds(typeIds: Iterable<string>): void;
    setNodeTypeExcluded(typeId: string, excluded?: boolean): void;
    getExcludedTypeIds(): string[];
    getSelectedNodeType(): Node | null;
    selectNodeType(typeId: string | null): boolean;
    destroy(): void;
}

// FILE: diagram/stocksharp-diagram.d.ts
import type { DiagramDocument } from '../core/model.js';
import type { DiagramGlobalErrorKind, DiagramInteractionPermissions, DiagramPortRuntimeState, DiagramRuntimeState, DiagramSelection, DiagramViewState } from '../core/state.js';
import { EventEmitter } from './event-emitter.js';
import type { DiagramEvents, ContextCommand, DiagramLoadOptions, DiagramGridSettings, DiagramNodeBounds, DiagramPoint, DiagramOptions, DiagramScreenshotOptions, DiagramThemeOptions, LinkValidationResult, LinkValidator, NodeErrorKind, NodeErrorOptions } from './api.js';
import { DiagramNode, Link, Port, type PortDirection, type PortUpdate } from './types.js';
export declare class StockSharpDiagram extends EventEmitter<DiagramEvents> {
    constructor(options: DiagramOptions);
    setLinkValidator(validator: LinkValidator | null): void;
    addDiagramNode(node: DiagramNode): string;
    dropNodeFromPalette(typeId: string, clientX: number, clientY: number): string | null;
    removeDiagramNode(nodeId: string): void;
    moveNode(nodeId: string, x: number, y: number): void;
    getNodeBounds(nodeId: string): DiagramNodeBounds | null;
    getPortPosition(nodeId: string, direction: PortDirection, portId: string): DiagramPoint | null;
    worldToView(x: number, y: number): DiagramPoint;
    setGridSnap(enabled: boolean, size?: number): void;
    getGridSnap(): DiagramGridSettings;
    nudgeSelection(dx: number, dy: number): boolean;
    addLink(link: Link): boolean;
    validateLink(link: Link, excludeLinkId?: string): LinkValidationResult;
    relink(linkId: string, link: Link): LinkValidationResult;
    removeLink(link: Link): void;
    addPort(nodeId: string, direction: PortDirection, port: Port): void;
    removePort(nodeId: string, direction: PortDirection, portId: string): void;
    updatePortType(nodeId: string, direction: PortDirection, portId: string, type: string): void;
    updatePort(nodeId: string, direction: PortDirection, portId: string, patch: PortUpdate): boolean;
    setNodePorts(nodeId: string, inPorts: ReadonlyArray<{
        key: string;
        name: string;
        description: string;
        type: string;
        maxLinks: number;
        availableTypes?: string[];
        isDynamic?: boolean;
        dynamicMode?: string;
    }>, outPorts: ReadonlyArray<{
        key: string;
        name: string;
        description: string;
        type: string;
        maxLinks: number;
        availableTypes?: string[];
        isDynamic?: boolean;
        dynamicMode?: string;
    }>): void;
    updateNode(nodeId: string, patch: {
        name?: string;
        description?: string;
        color?: string;
        border?: string;
    }): void;
    setNodeMessage(nodeId: string, message: string): void;
    setNodeError(nodeId: string, message: string, options?: NodeErrorOptions): boolean;
    clearNodeError(nodeId: string, kind?: NodeErrorKind): boolean;
    getRuntimeState(): DiagramRuntimeState;
    setRuntimeState(state: DiagramRuntimeState): void;
    clearRuntimeState(): void;
    setActiveNode(nodeId: string | null): boolean;
    setPortRuntimeState(nodeId: string, direction: PortDirection, portId: string, patch: Partial<DiagramPortRuntimeState>): boolean;
    setGlobalError(message: string | null, kind?: DiagramGlobalErrorKind): void;
    setNodeParamValue(nodeId: string, paramName: string, value: string | undefined): void;
    setNodeName(nodeId: string, value: string): void;
    /** Groups host-driven document edits into one undo/redo operation. */
    transaction<T>(label: string, action: () => T): T;
    setShowNodeMessages(show: boolean): void;
    setReadOnly(readonly: boolean): void;
    getInteractionPermissions(): DiagramInteractionPermissions;
    setInteractionPermissions(patch: Partial<DiagramInteractionPermissions>): void;
    applySocketTheme(): void;
    applyOverviewTheme(): void;
    setOverviewVisible(visible: boolean): void;
    zoomToFit(): void;
    setZoom(scale: number): void;
    getViewState(): DiagramViewState;
    setViewState(state: DiagramViewState): void;
    /** Serializes only viewport preferences; strategy data stays in saveDocument(). */
    saveViewState(space?: number): string;
    /** Restores a versioned viewport snapshot produced by saveViewState(). */
    loadViewState(source: string | unknown): void;
    /** Detached PNG-ready canvas; use scope: 'content' for the complete scheme. */
    takeScreenshot(options?: DiagramScreenshotOptions): HTMLCanvasElement;
    getSelection(): DiagramSelection;
    selectNodes(nodeIds: readonly string[]): void;
    selectLink(linkId: string | null): void;
    selectPort(nodeId: string, direction: PortDirection, portId: string): void;
    resize(width: number, height: number): void;
    isFullscreen(): boolean;
    setFullscreenButtonVisible(visible: boolean): void;
    isFullscreenButtonVisible(): boolean;
    /** Updates only the control's state after the host changed its own layout. */
    setFullscreenState(fullscreen: boolean): void;
    setTheme(options: DiagramThemeOptions): void;
    enableUndo(enabled: boolean): void;
    enableRedo(enabled: boolean): void;
    enableHelp(enabled: boolean): void;
    canUndo(): boolean;
    canRedo(): boolean;
    undo(): void;
    redo(): void;
    cutSelection(): void;
    copySelection(): void;
    pasteSelection(): void;
    deleteSelection(): void;
    copySelectionToClipboard(): Promise<boolean>;
    pasteSelectionFromClipboard(): Promise<boolean>;
    getContextCommands(): Array<{
        command: ContextCommand;
        enabled: boolean;
    }>;
    executeContextCommand(command: ContextCommand): boolean;
    clear(): void;
    load(nodes: DiagramNode[], links: Link[], options?: DiagramLoadOptions): void;
    save(): {
        nodes: DiagramNode[];
        links: Link[];
    };
    loadDocument(document: DiagramDocument | string, options?: DiagramLoadOptions): void;
    saveDocument(): DiagramDocument;
    destroy(): void;
}

// FILE: diagram/types.d.ts
import type { JsonObject } from '../core/model.js';
export interface PortTypeInit {
    name: string;
    color: string;
}
export declare class PortType {
    readonly name: string;
    readonly color: string;
    constructor(init: PortTypeInit);
}
export interface PortInit {
    id: string;
    name: string;
    description?: string;
    type?: string;
    maxLinks?: number;
    availableTypes?: string[];
    isDynamic?: boolean;
    dynamicMode?: string;
    isSibling?: boolean;
}
/** Mutable port properties. Port identity and direction remain stable. */
export type PortUpdate = Partial<Omit<PortInit, 'id'>>;
export declare class Port {
    id: string;
    name: string;
    description: string;
    type: string;
    maxLinks: number;
    availableTypes: string[];
    isDynamic: boolean;
    dynamicMode: string;
    isSibling: boolean;
    constructor(init: PortInit);
    clone(): Port;
}
export interface ParamSchema {
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
export interface NodeInit {
    id: string;
    name: string;
    description?: string;
    groupName?: string;
    inPorts?: Array<Port | PortInit>;
    outPorts?: Array<Port | PortInit>;
    icon?: string;
    parameters?: ParamSchema[];
    openAction?: string;
}
export declare class Node {
    id: string;
    name: string;
    description: string;
    groupName: string;
    inPorts: Port[];
    outPorts: Port[];
    icon: string;
    parameters: ParamSchema[];
    openAction: string;
    constructor(init: NodeInit);
    clone(): Node;
}
export interface DiagramNodeInit extends NodeInit {
    typeId?: string;
    x?: number;
    y?: number;
    color?: string;
    border?: string;
    message?: string;
    isPlaceholder?: boolean;
    paramValues?: Record<string, string>;
}
export declare class DiagramNode extends Node {
    typeId: string;
    x: number;
    y: number;
    color: string;
    border: string;
    message: string;
    isPlaceholder: boolean;
    paramValues: Record<string, string>;
    constructor(init: DiagramNodeInit);
    clone(): DiagramNode;
}
export type LinkEndpoint = string | {
    id: string;
};
export interface LinkInit {
    id?: string;
    outNode: LinkEndpoint;
    outPort: LinkEndpoint;
    inNode: LinkEndpoint;
    inPort: LinkEndpoint;
    metadata?: JsonObject;
}
export declare class Link {
    id: string;
    outNode: LinkEndpoint;
    outPort: LinkEndpoint;
    inNode: LinkEndpoint;
    inPort: LinkEndpoint;
    metadata: JsonObject;
    constructor(init: LinkInit);
}
export type PortDirection = 'in' | 'out';
export interface PortData {
    id: string;
    name: string;
    description: string;
    type: string;
    maxLinks: number;
    direction: PortDirection;
    availableTypes?: string[];
    isDynamic?: boolean;
    dynamicMode?: string;
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
    isPlaceholder?: boolean;
    loc: string;
    openAction?: string;
    parameters?: ParamSchema[];
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

// FILE: embed.d.ts
import { StockSharpDiagram } from './diagram/stocksharp-diagram.js';
import type { FullscreenRequestedPayload } from './diagram/api.js';
export interface DiagramEmbedSchemeNode {
    id: string;
    typeId: string;
    name: string;
    x: number;
    y: number;
}
export interface DiagramEmbedSchemeLink {
    from: string;
    fromPort: string;
    to: string;
    toPort: string;
}
export interface DiagramEmbedScheme {
    nodes: DiagramEmbedSchemeNode[];
    links: DiagramEmbedSchemeLink[];
}
export interface DiagramEmbedHandle {
    readonly host: HTMLElement;
    readonly diagram: StockSharpDiagram;
    readonly destroyed: boolean;
    destroy(): void;
}
export interface DiagramEmbedOptions {
    onFullscreenRequested?: (request: FullscreenRequestedPayload, handle: DiagramEmbedHandle) => void;
    onDestroyed?: (handle: DiagramEmbedHandle) => void;
}
export declare function renderScheme(div: HTMLElement, paletteUrl: string, scheme: DiagramEmbedScheme, options?: DiagramEmbedOptions): Promise<DiagramEmbedHandle | null>;
export declare function destroyRenderedDiagram(div: HTMLElement): boolean;
export declare function renderFromSource(div: HTMLElement, paletteUrl: string, srcUrl: string, options?: DiagramEmbedOptions): Promise<DiagramEmbedHandle | null>;
export declare function renderFromInline(div: HTMLElement, paletteUrl: string, json: string, options?: DiagramEmbedOptions): Promise<DiagramEmbedHandle | null>;
export declare function renderAll(root?: ParentNode, options?: DiagramEmbedOptions): void;

// FILE: i18n.d.ts
export interface DesignerI18n {
    panelStrategies?: string;
    panelPalette?: string;
    panelProperties?: string;
    panelDiagram?: string;
    panelOutput?: string;
    panelErrors?: string;
    panelCode?: string;
    panelBacktest?: string;
    panelOptimizer?: string;
    panelLive?: string;
    liveNoRuns?: string;
    selectAnElement?: string;
    noErrors?: string;
    strategies?: string;
    noStrategiesYet?: string;
    rename?: string;
    newStrategy?: string;
    refresh?: string;
    run?: string;
    stop?: string;
    newIndicator?: string;
    newComposite?: string;
    newCodeStrategy?: string;
    codeLanguagePrompt?: string;
    groupStrategies?: string;
    groupComposites?: string;
    groupIndicators?: string;
    noComposites?: string;
    noIndicators?: string;
    groupOptimizations?: string;
    groupLive?: string;
    optReady?: string;
    optNoStrategy?: string;
    btReady?: string;
    btNoStrategy?: string;
    noOptimizations?: string;
    newOptimization?: string;
    optimize?: string;
    duplicate?: string;
    delete?: string;
    create?: string;
    deleteStrategyTitle?: string;
    deleteStrategyMsg?: string;
    ctxExport?: string;
    encryptTitle?: string;
    encryptLabel?: string;
    importEncTitle?: string;
    importEncLabel?: string;
    importEncRetry?: string;
    openDocumentation?: string;
    selectPlaceholder?: string;
    notANumber?: string;
    expectedTimeSpan?: string;
    basicSettings?: string;
    advancedSettings?: string;
    noParameters?: string;
    noBasicParameters?: string;
    noneOption?: string;
    loadingParameters?: string;
    loading?: string;
    cancel?: string;
    discardTitle?: string;
    discardOpenMsg?: string;
    discardCreateMsg?: string;
    discardOpenOk?: string;
    discardCreateOk?: string;
    nodeMessage?: string;
    nodeName?: string;
    strategyNamePrompt?: string;
    untitledStrategy?: string;
    annotationPlaceholder?: string;
    searchPlaceholder?: string;
    noMatches?: string;
    undo?: string;
    redo?: string;
    cut?: string;
    copy?: string;
    paste?: string;
    ctxOpen?: string;
    properties?: string;
    ctxHelp?: string;
    collapse?: string;
    expand?: string;
    fillEmailPassword?: string;
    signingIn?: string;
    loginFailed?: string;
    connectionError?: string;
    signInToBacktest?: string;
    signInToExport?: string;
    signInToOptimize?: string;
    signInToRunLive?: string;
    statusLabel?: string;
    statusSaved?: string;
    statusModified?: string;
    loadingEllipsis?: string;
    failed?: string;
    optGrid?: string;
    optHeatmap?: string;
    opt3d?: string;
    optPickRow?: string;
    stat_winning_trades?: string;
    stat_trade_count?: string;
    stat_roundtrip_count?: string;
    stat_avg_trade_profit?: string;
    stat_avg_win?: string;
    stat_avg_loss?: string;
    stat_losing_trades?: string;
    stat_max_long_position?: string;
    stat_max_short_position?: string;
    stat_max_profit?: string;
    stat_max_drawdown?: string;
    stat_max_relative_drawdown?: string;
    stat_return?: string;
    stat_recovery_factor?: string;
    stat_net_profit?: string;
    stat_max_latency_reg?: string;
    stat_max_latency_cancel?: string;
    stat_min_latency_reg?: string;
    stat_min_latency_cancel?: string;
    stat_order_count?: string;
    stat_order_error_count?: string;
    stat_insufficient_fund_errors?: string;
    stat_trades_per_month?: string;
    stat_trades_per_day?: string;
    stat_max_drawdown_date?: string;
    stat_max_profit_date?: string;
    stat_commission?: string;
    stat_max_drawdown_percent?: string;
    stat_net_profit_percent?: string;
    stat_sharpe_ratio?: string;
    stat_sortino_ratio?: string;
    stat_profit_factor?: string;
    stat_expectancy?: string;
    stat_calmar_ratio?: string;
    stat_sterling_ratio?: string;
    stat_avg_drawdown?: string;
    stat_order_cancel_errors?: string;
    stat_gross_loss?: string;
    stat_gross_profit?: string;
    stat_max_profit_percent?: string;
    stat_sharpe?: string;
    stat_trades?: string;
    btstat_starting?: string;
    btstat_done?: string;
    btstat_stopped?: string;
    btstat_failed?: string;
    bterr_chart_runtime_missing?: string;
    order_buy?: string;
    order_sell?: string;
    loglevel_inherit?: string;
    loglevel_verbose?: string;
    loglevel_debug?: string;
    loglevel_info?: string;
    loglevel_warning?: string;
    loglevel_error?: string;
    loglevel_off?: string;
    opt_no_params?: string;
    opt_bool_values?: string;
    optstat_starting?: string;
    optstat_done?: string;
    optstat_stopped?: string;
    optstat_failed?: string;
    opterr_plotly_missing?: string;
}
export declare function t(key: keyof DesignerI18n, fallback: string): string;

// FILE: index.d.ts
export { DiagramDocumentError, cloneDiagramDocument, createDiagramDocument, parseDiagramDocument, serializeDiagramDocument, } from './core/document.js';
export { DiagramActionRegistry } from './core/action-registry.js';
export type { DiagramAction, DiagramActionState, } from './core/action-registry.js';
export { DiagramCommandHistory } from './core/history.js';
export type { DiagramCommand, DiagramHistoryListener, DiagramHistoryState, } from './core/history.js';
export { DIAGRAM_DOCUMENT_VERSION } from './core/model.js';
export type { DiagramDocument, DiagramDocumentEndpoint, DiagramDocumentInput, DiagramDocumentLink, DiagramDocumentLinkInput, DiagramDocumentNode, DiagramDocumentNodeInput, DiagramDocumentPort, DiagramDocumentPortInput, DiagramDocumentVersion, DiagramParameterSchema, JsonObject, JsonPrimitive, JsonValue, } from './core/model.js';
export { createEditableDiagramPermissions, createDiagramNodeRuntimeState, createDiagramPortRuntimeState, createDiagramRuntimeState, cloneDiagramRuntimeState, createDiagramSelection, createDiagramViewState, createReadOnlyDiagramPermissions, } from './core/state.js';
export { DIAGRAM_VIEW_STATE_VERSION, DiagramViewStateError, createDiagramViewStateDocument, parseDiagramViewState, serializeDiagramViewState, } from './core/view-state.js';
export type { DiagramViewStateDocument } from './core/view-state.js';
export type { DiagramErrorState, DiagramGlobalErrorKind, DiagramInteractionPermissions, DiagramNodeErrorKind, DiagramNodePortRuntimeState, DiagramNodeRuntimeState, DiagramPortDirection, DiagramPortRuntimeState, DiagramRuntimeState, DiagramSelectedPort, DiagramSelection, DiagramViewState, } from './core/state.js';
export { StockSharpDiagram, } from './diagram/stocksharp-diagram.js';
export type { ContextCommand, ContextCommandPayload, ContextCommandState, ContextMenuRequestedPayload, DiagramEvents, DiagramClipboard, DiagramGridSettings, DiagramLoadOptions, DiagramNodeBounds, DiagramOptions, DiagramPoint, DiagramScreenshotOptions, DiagramScreenshotScope, DiagramThemeOptions, DocumentLoadFailedPayload, LinkChangePayload, LinkHoverPayload, LinkRelinkedPayload, LinkSelectedPayload, LinkValidationPayload, LinkValidationReason, LinkValidationResult, LinkValidator, LinkValidatorArgs, LoadFinishedPayload, NodeChangePayload, NodeErrorKind, NodeErrorOptions, NodeHoverPayload, NodeMovedPayload, NodeSelectedPayload, PortHoverPayload, PortClickAction, PortClickedPayload, PortSelectedPayload, } from './diagram/api.js';
export { StockSharpCatalog } from './diagram/catalog.js';
export type { CatalogEvents } from './diagram/catalog.js';
export { PALETTE_DRAG_MIME, StockSharpPalette, } from './diagram/palette.js';
export type { PaletteContextMenuPayload, PaletteEvents, PaletteNodePayload, PaletteOptions, PaletteSelectionChangedPayload, } from './diagram/palette.js';
export { DiagramNode, Link, Node, Port, PortType, } from './diagram/types.js';
export type { DiagramNodeInit, LinkEndpoint, LinkInit, NodeData, NodeInit, PaletteGroupData, PaletteNodeData, ParamSchema, PortData, PortDirection, PortInit, PortUpdate, PortTypeInit, } from './diagram/types.js';
export { destroyRenderedDiagram, renderAll, renderFromInline, renderFromSource, renderScheme, } from './embed.js';
export type { DiagramEmbedHandle, DiagramEmbedScheme, DiagramEmbedSchemeLink, DiagramEmbedSchemeNode, } from './embed.js';
