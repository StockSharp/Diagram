import type { DiagramDocument } from '../core/model.js';
import type {
    DiagramRuntimeState,
    DiagramSelection,
    DiagramViewState,
} from '../core/state.js';
import type { DiagramNode, Link, Port, PortDirection } from './types.js';

export interface DiagramOptions {
    div: HTMLElement;
    catalog: import('./catalog.js').StockSharpCatalog;
    overviewDiv?: HTMLElement | null;
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

export type DiagramScreenshotScope = import('../ssgraph.js').DiagramScreenshotScope;
export type DiagramScreenshotOptions = import('../ssgraph.js').DiagramScreenshotOptions;

export interface DiagramClipboard {
    readText(): Promise<string>;
    writeText(value: string): Promise<void>;
}

export interface DiagramThemeOptions {
    diagramBackground?: string;
    overviewBackground?: string;
    gridColor?: string;
    linkMaxLightness?: number;
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

export type LinkValidationReason = import('../ssgraph.js').LinkValidationReason;
export type LinkValidationResult = import('../ssgraph.js').LinkValidationResult;

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
    runtimeStateChanged: { state: DiagramRuntimeState };
    undoStackChanged: { canUndo: boolean; canRedo: boolean };
    documentLoaded: { document: DiagramDocument };
    documentLoadFailed: DocumentLoadFailedPayload;
}
