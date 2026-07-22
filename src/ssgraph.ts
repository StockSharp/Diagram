// ssgraph — in-house canvas diagram editor.
//
// Shaped to the *Layer A* contract: the public API and event set mirror
// `StockSharpDiagram` / `diagram/types.ts` / `DiagramEvents`, NOT the
// legacy declarative `window.go` surface. Compatibility-only calls collapse
// to the corresponding procedural operations here.
//
// Dependency-free, pure 2D canvas. Demonstrates the hard parts: typed
// in/out ports, bezier links, node drag, drag-to-link with validation,
// selection, delete, zoom/pan, load/save round-trip.

import { createDiagramDocument, parseDiagramDocument } from './core/document.js';
import { DiagramCommandHistory } from './core/history.js';
import type {
    DiagramDocument,
    DiagramParameterSchema,
    JsonObject,
    JsonValue,
} from './core/model.js';
import type {
    DiagramGlobalErrorKind,
    DiagramInteractionPermissions,
    DiagramPortRuntimeState,
    DiagramRuntimeState,
    DiagramSelection,
    DiagramViewState,
} from './core/state.js';
import {
    cloneDiagramRuntimeState,
    createDiagramNodeRuntimeState,
    createDiagramPortRuntimeState,
    createDiagramRuntimeState,
    createEditableDiagramPermissions,
    createReadOnlyDiagramPermissions,
} from './core/state.js';

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

export type DiagramNodeSnapshot = DiagramNodeInit
    & Required<Pick<DiagramNodeInit, 'id' | 'typeId' | 'name' | 'color' | 'border' | 'x' | 'y'>>
    & { inPorts: PortInit[]; outPorts: PortInit[] };

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

export type LinkValidationReason =
    | 'allowed'
    | 'missing-link'
    | 'missing-node'
    | 'missing-port'
    | 'same-node'
    | 'invalid-direction'
    | 'incompatible-type'
    | 'duplicate-link'
    | 'source-limit'
    | 'target-limit'
    | 'host-rejected';

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
    nodeAdded: { node: NodeModel };
    nodeRemoved: { node: NodeModel };
    nodeMoved: { node: NodeModel };
    nodeChanged: { node: NodeModel };
    nodeSelected: { node: NodeModel | null; selected: boolean };
    nodeHover: { node: NodeModel; hovering: boolean };
    linkAdded: { link: LinkModel };
    linkRemoved: { link: LinkModel };
    linkRelinked: { link: LinkModel; previous: LinkInit & { id: string } };
    linkSelected: { link: LinkModel | null; selected: boolean };
    linkHover: { link: LinkModel; hovering: boolean };
    linkValidation: {
        fromNode: NodeModel;
        from: PortModel;
        toNode: NodeModel;
        to: PortModel;
        allowed: boolean;
        reason: LinkValidationReason;
    };
    portSelected: { node: NodeModel; port: PortModel };
    portClicked: {
        node: NodeModel;
        port: PortModel;
        action: PortClickAction;
        ctrlKey: boolean;
        shiftKey: boolean;
        altKey: boolean;
        metaKey: boolean;
    };
    portHover: { node: NodeModel; port: PortModel; hovering: boolean };
    nodeOpen: { node: NodeModel };
    loadFinished: { nodes: NodeModel[]; links: LinkModel[] };
    zoomChanged: { scale: number };
    viewChanged: DiagramViewState;
    // Long-press on touch / right-click on desktop. (x, y) are page coords
    // so the host can position a DOM menu directly. Port, link or node
    // (or all null for empty-space) describe the target.
    contextMenu: {
        x: number;
        y: number;
        link: LinkModel | null;
        node: NodeModel | null;
        port: { node: NodeModel; port: PortModel } | null;
    };
    // Fires whenever the undo or redo stacks change so the host can
    // enable/disable Undo/Redo toolbar buttons live.
    undoStackChanged: { canUndo: boolean; canRedo: boolean };
    selectionChanged: DiagramSelection;
    runtimeStateChanged: { state: DiagramRuntimeState };
}

interface DiagramRenderOptions {
    grid: boolean;
    overview: boolean;
    selection: boolean;
    runtime: boolean;
    transient: boolean;
}

const SCREEN_RENDER_OPTIONS: DiagramRenderOptions = {
    grid: true,
    overview: true,
    selection: true,
    runtime: true,
    transient: true,
};
// One reversible operation. `do` re-applies it (redo), `undo` reverses
// it. Both must be idempotent w.r.t. repeated undo/redo. label is for
// telemetry/debug only.
interface AppliedAction { do: () => void; undo: () => void; label: string }
type EvName = keyof DiagramEvents;

// ---- model ----------------------------------------------------------
function copyJsonValue(value: JsonValue): JsonValue {
    if (Array.isArray(value)) return value.map(copyJsonValue);
    if (value !== null && typeof value === 'object') return copyJsonObject(value);
    return value;
}

function copyJsonObject(value: JsonObject | undefined): JsonObject {
    if (value === undefined) return {};
    const result: JsonObject = {};
    for (const [key, item] of Object.entries(value)) result[key] = copyJsonValue(item);
    return result;
}

function copyParameters(value: readonly DiagramParameterSchema[] | undefined): DiagramParameterSchema[] {
    return (value ?? []).map((parameter) => ({ ...parameter, options: [...parameter.options] }));
}

function normalizePortType(type: string): string {
    return type.trim().toLowerCase();
}

function isWildcardPortType(type: string): boolean {
    const normalized = normalizePortType(type);
    return normalized === ''
        || normalized === '*'
        || normalized === 'any'
        || normalized === 'anydata'
        || normalized === 'any data'
        || normalized === 'object'
        || normalized === 'system.object'
        || normalized.startsWith('system.object,');
}

function arePortTypesCompatible(fromType: string, toType: string, availableTypes: readonly string[]): boolean {
    if (isWildcardPortType(fromType) || isWildcardPortType(toType)) return true;
    const normalizedFrom = normalizePortType(fromType);
    return [toType, ...availableTypes].some((type) =>
        isWildcardPortType(type) || normalizePortType(type) === normalizedFrom);
}

export class PortModel {
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
    // layout cache (world coords), filled at draw time
    cx = 0;
    cy = 0;
    constructor(init: PortInit, dir: PortDirection) {
        this.id = init.id;
        this.name = init.name;
        this.description = init.description ?? '';
        this.type = init.type ?? '';
        this.direction = dir;
        this.maxLinks = typeof init.maxLinks === 'number' ? init.maxLinks : 0;
        this.availableTypes = [...(init.availableTypes ?? [])];
        this.isDynamic = init.isDynamic ?? false;
        this.dynamicMode = init.dynamicMode ?? '';
        this.isSibling = init.isSibling ?? false;
        this.metadata = copyJsonObject(init.metadata);
    }

    toInit(): PortInit {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            type: this.type,
            maxLinks: this.maxLinks,
            availableTypes: [...this.availableTypes],
            isDynamic: this.isDynamic,
            dynamicMode: this.dynamicMode,
            isSibling: this.isSibling,
            metadata: copyJsonObject(this.metadata),
        };
    }
}

export class NodeModel {
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
    runtimeError = '';
    errorFlashStart: number | null = null;
    x: number;
    y: number;
    inPorts: PortModel[];
    outPorts: PortModel[];
    // layout cache
    w = 160;
    h = 48;
    constructor(init: DiagramNodeInit, id: string) {
        this.id = id;
        this.typeId = init.typeId ?? id;
        this.name = init.name;
        this.description = init.description ?? '';
        this.groupName = init.groupName ?? 'Common';
        this.color = init.color ?? '#d7d7d7';
        this.border = init.border ?? '#8c8c8c';
        this.icon = init.icon ?? '';
        this.openAction = init.openAction ?? '';
        this.message = init.message ?? '';
        this.parameters = copyParameters(init.parameters);
        this.paramValues = { ...(init.paramValues ?? {}) };
        this.metadata = copyJsonObject(init.metadata);
        this.isPlaceholder = init.isPlaceholder ?? false;
        this.loadError = init.loadError ?? '';
        this.x = typeof init.x === 'number' ? init.x : 0;
        this.y = typeof init.y === 'number' ? init.y : 0;
        this.inPorts = (init.inPorts ?? []).map((p) => new PortModel(p, 'in'));
        this.outPorts = (init.outPorts ?? []).map((p) => new PortModel(p, 'out'));
    }
    port(id: string): PortModel | undefined {
        return this.inPorts.find((p) => p.id === id) ?? this.outPorts.find((p) => p.id === id);
    }

    toInit(includeRuntimeState: boolean = true): DiagramNodeInit & { id: string } {
        const init: DiagramNodeInit & { id: string } = {
            id: this.id,
            typeId: this.typeId,
            name: this.name,
            description: this.description,
            groupName: this.groupName,
            color: this.color,
            border: this.border,
            icon: this.icon,
            openAction: this.openAction,
            message: this.message,
            parameters: copyParameters(this.parameters),
            paramValues: { ...this.paramValues },
            metadata: copyJsonObject(this.metadata),
            isPlaceholder: this.isPlaceholder,
            x: this.x,
            y: this.y,
            inPorts: this.inPorts.map((port) => port.toInit()),
            outPorts: this.outPorts.map((port) => port.toInit()),
        };
        if (includeRuntimeState && this.loadError.length > 0) init.loadError = this.loadError;
        return init;
    }
}

export class LinkModel {
    readonly id: string;
    readonly metadata: JsonObject;

    constructor(
        public from: string,
        public fromPort: string,
        public to: string,
        public toPort: string,
        id: string = '',
        metadata?: JsonObject,
    ) {
        this.id = id;
        this.metadata = copyJsonObject(metadata);
    }
    key(): string { return `${this.from}|${this.fromPort}|${this.to}|${this.toPort}`; }

    toInit(): LinkInit & { id: string } {
        return {
            id: this.id,
            from: this.from,
            fromPort: this.fromPort,
            to: this.to,
            toPort: this.toPort,
            metadata: copyJsonObject(this.metadata),
        };
    }
}

const HEADER_H = 22;
const PORT_R = 6;
const PORT_ROW_H = 20;
const NODE_PAD = 10;
const RELINK_HANDLE_PX = 8;  // WPF relink adornment is an 8x8 diamond
const RELINK_DRAG_THRESHOLD_PX = 4;
const PORT_SQ = 9;           // socket square size — sits outside the node
const LINK_STUB = 22;        // min horizontal lead-in/out before the elbow
const LINK_HOP = 5;          // jump-over arc radius at crossings
const SNAP_PX = 32;          // plug↔socket magnet radius (screen px)
const DEFAULT_GRID_SIZE = 28;
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 4;
const INTRO_MS = 520;        // entrance animation duration
const INTRO_RISE = 70;       // px the scheme rises from below
const ERROR_FLASH_MS = 1100;
const ERROR_RED = '#f6465d';
const ERROR_BACKGROUND = '#7d2632';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function hashHue(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
    return ((h % 360) + 360) % 360;
}

// Clamp an hsl() colour's lightness to a ceiling (0..1), keeping its hue and saturation. The link
// palette is tuned for a dark canvas (light, ~58%-lightness colours), so on a light canvas those
// wash out; a light theme passes a low ceiling to darken the links just enough to stay readable
// while keeping each hue distinct. Non-hsl inputs are returned untouched.
function clampLightness(color: string, maxL: number): string {
    const m = color.match(/^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/i);
    if (m === null) return color;
    return `hsl(${m[1]}, ${m[2]}%, ${Math.min(+m[3], maxL * 100)}%)`;
}

function colorLuminance(color: string | undefined): number {
    if (color === undefined) return 0;
    const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex !== null) {
        const raw = hex[1].length === 3
            ? hex[1].split('').map((x) => x + x).join('')
            : hex[1];
        const value = parseInt(raw, 16);
        return 0.299 * ((value >> 16) & 255)
            + 0.587 * ((value >> 8) & 255)
            + 0.114 * (value & 255);
    }
    const rgb = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    if (rgb !== null)
        return 0.299 * +rgb[1] + 0.587 * +rgb[2] + 0.114 * +rgb[3];
    return 0;
}

export class Diagram {
    private readonly host: HTMLElement;
    private readonly canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private readonly opts: DiagramOptions;

    private nodes: NodeModel[] = [];
    private links: LinkModel[] = [];
    private idSeq = 1;
    private linkSeq = 1;
    private documentMetadata: JsonObject = {};
    private runtimeState: DiagramRuntimeState = createDiagramRuntimeState();
    private runtimePulse = 0;
    private globalErrorFlashStart: number | null = null;

    // viewport transform: screen = world * scale + offset
    private scale = 1;
    private offX = 0;
    private offY = 0;

    private width = 0;
    private height = 0;
    private dpr = 1;
    private drawScheduled = false;
    private gridSnapEnabled: boolean;
    private gridSize: number;

    // interaction state
    private selectedNode: NodeModel | null = null;          // primary (last) selected
    private selectedNodes = new Set<NodeModel>();           // multi-selection
    private selectedLink: LinkModel | null = null;
    private selectedPort: { node: NodeModel; port: PortModel } | null = null;
    private dragNode: NodeModel | null = null;
    private dragStart: Array<{ n: NodeModel; x: number; y: number }> = [];   // group-drag origin
    private dragAnchor = { wx: 0, wy: 0 };
    private dragDX = 0;
    private dragDY = 0;
    private panning = false;
    private panX = 0;
    private panY = 0;
    private permissions = createEditableDiagramPermissions();
    private showNodeMessages = true;
    private iconCache = new Map<string, HTMLImageElement | null>();   // node icon images by URL (null = loading/failed)
    private rubber: { x0: number; y0: number; x: number; y: number } | null = null;   // world rect
    private clip: DiagramDocument | null = null;
    private linking: { node: NodeModel; port: PortModel } | null = null;
    private relinking: { link: LinkModel; end: 'from' | 'to' } | null = null;
    private relinkCandidate: {
        link: LinkModel;
        end: 'from' | 'to';
        sx: number;
        sy: number;
    } | null = null;
    private linkSnap: { node: NodeModel; port: PortModel } | null = null;
    private cursor = { x: 0, y: 0 };           // screen
    private hoverPort: { node: NodeModel; port: PortModel } | null = null;
    private hoverNode: NodeModel | null = null;
    private hoveredLink: LinkModel | null = null;
    private tipTimer: ReturnType<typeof setTimeout> | null = null;
    private tipShow = false;
    private tipTarget: PortModel | NodeModel | null = null;
    // Long-press (touch) / right-click (desktop) → contextMenu event.
    private lpTimer: ReturnType<typeof setTimeout> | null = null;
    private lpStart: { sx: number; sy: number; px: number; py: number } | null = null;
    private readonly lpDelayMs = 550;
    private readonly lpMoveTol = 7;
    private readonly history: DiagramCommandHistory;
    private readonly domDisposables: Array<() => void> = [];
    private destroyed = false;

    // overview minimap (go.Overview parity)
    private introStart: number | null = null;
    private overviewVisible = true;
    private ovDragging = false;
    private ovGeo: { x: number; y: number; w: number; h: number; s: number; minX: number; minY: number } | null = null;

    private validator: LinkValidator | null = null;
    private handlers = new Map<EvName, Set<(p: never) => void>>();

    constructor(opts: DiagramOptions) {
        this.opts = opts;
        this.host = opts.host;
        this.gridSnapEnabled = opts.gridSnap ?? false;
        this.gridSize = this.normalizeGridSize(opts.gridSize ?? DEFAULT_GRID_SIZE);
        this.history = new DiagramCommandHistory(({ canUndo, canRedo }) => {
            this.emit('undoStackChanged', { canUndo, canRedo });
        });
        this.canvas = document.createElement('canvas');
        this.canvas.style.display = 'block';
        this.canvas.tabIndex = 0;            // focusable → key events
        this.canvas.style.outline = 'none';
        // Eat browser-native touch gestures (page scroll / pinch-zoom) so
        // fingers actually drive our pan/zoom on mobile instead of the page.
        this.canvas.style.touchAction = 'none';
        // No OS text-selection on long-press (would pop the iOS magnifier
        // and select node/link captions instead of firing our menu).
        this.canvas.style.userSelect = 'none';
        (this.canvas.style as unknown as { webkitUserSelect: string }).webkitUserSelect = 'none';
        (this.canvas.style as unknown as { webkitTouchCallout: string }).webkitTouchCallout = 'none';
        this.host.appendChild(this.canvas);
        const ctx = this.canvas.getContext('2d');
        if (ctx === null) throw new Error('ssgraph: 2d context unavailable');
        this.ctx = ctx;
        this.resize(this.host.clientWidth || 800, this.host.clientHeight || 480);
        this.bind();
    }

    // ---- events -----------------------------------------------------
    on<K extends EvName>(ev: K, h: (p: DiagramEvents[K]) => void): () => void {
        let set = this.handlers.get(ev);
        if (set === undefined) { set = new Set(); this.handlers.set(ev, set); }
        set.add(h as (p: never) => void);
        return () => set!.delete(h as (p: never) => void);
    }
    private emit<K extends EvName>(ev: K, p: DiagramEvents[K]): void {
        const set = this.handlers.get(ev);
        if (set === undefined) return;
        for (const h of set) { try { (h as (x: DiagramEvents[K]) => void)(p); } catch (e) { console.error(e); } }
    }

    // ---- public API (Layer-A-shaped) --------------------------------
    setLinkValidator(fn: LinkValidator | null): void { this.validator = fn; }
    setGridSnap(enabled: boolean, size?: number): void {
        const nextSize = size === undefined ? this.gridSize : this.normalizeGridSize(size);
        this.gridSnapEnabled = enabled;
        this.gridSize = nextSize;
        this.scheduleDraw();
    }
    getGridSnap(): { enabled: boolean; size: number } {
        return { enabled: this.gridSnapEnabled, size: this.gridSize };
    }

    private normalizeGridSize(size: number): number {
        if (!Number.isFinite(size) || size <= 0) throw new RangeError('ssgraph: grid size must be a positive finite number');
        return size;
    }

    private nextNodeId(): string {
        let id: string;
        do id = `n${this.idSeq++}`;
        while (this.nodes.some((node) => node.id === id));
        return id;
    }

    private nextLinkId(): string {
        let id: string;
        do id = `link_${this.linkSeq++}`;
        while (this.links.some((link) => link.id === id));
        return id;
    }

    addDiagramNode(init: DiagramNodeInit): string {
        const id = init.id ?? this.nextNodeId();
        if (id.trim().length === 0) throw new Error('ssgraph: node id cannot be empty');
        if (this.nodes.some((node) => node.id === id)) throw new Error(`ssgraph: duplicate node id "${id}"`);
        const fullInit: DiagramNodeInit = { ...init, id };
        this.doAddNode(fullInit);
        this.record({
            do:   () => { this.doAddNode(fullInit); },
            undo: () => { this.doRemoveNode(id); },
            label: 'add node',
        });
        return id;
    }
    private doAddNode(init: DiagramNodeInit): void {
        const id = init.id ?? this.nextNodeId();
        if (this.nodes.some((node) => node.id === id)) return;
        const node = new NodeModel(init, id);
        this.layoutNode(node);
        this.nodes.push(node);
        this.emit('nodeAdded', { node });
        this.scheduleDraw();
    }
    removeDiagramNode(id: string): void {
        const node = this.nodes.find((n) => n.id === id);
        if (node === undefined) return;
        // Capture full state for undo BEFORE mutating — we need both
        // the node init AND every link that gets cascaded out, so undo
        // can rebuild them in one shot.
        const snapshot = node.toInit(false);
        const cascaded = this.links
            .map((link, index) => ({ link, index }))
            .filter(({ link }) => link.from === id || link.to === id)
            .map(({ link, index }) => ({ init: link.toInit(), index }));
        const siblingTargets: Array<{ nodeId: string; portId: string }> = [];
        for (const { init } of cascaded) {
            if (init.from !== id || init.to === id) continue;
            const targetPort = this.findNode(init.to)?.inPorts.find((port) => port.id === init.toPort);
            if (targetPort?.isSibling !== true) continue;
            if (!siblingTargets.some((target) => target.nodeId === init.to && target.portId === init.toPort)) {
                siblingTargets.push({ nodeId: init.to, portId: init.toPort });
            }
        }
        const remove = (): void => {
            this.doRemoveNode(id);
            this.record({
                do:   () => { this.doRemoveNode(id); },
                undo: () => {
                    this.doAddNode(snapshot);
                    for (const { init, index } of cascaded) this.doAddLink(init, false, index);
                },
                label: 'remove node',
            });
        };
        if (siblingTargets.length === 0) {
            remove();
        } else {
            this.withTransaction('remove node', () => {
                remove();
                for (const target of siblingTargets) this.pruneDynamicSibling(target.nodeId, target.portId);
            });
        }
    }
    private doRemoveNode(id: string): void {
        const node = this.nodes.find((n) => n.id === id);
        if (node === undefined) return;
        const removedLinks = this.links.filter((l) => l.from === id || l.to === id);
        this.links = this.links.filter((l) => l.from !== id && l.to !== id);
        this.nodes = this.nodes.filter((n) => n !== node);
        let selectionChanged = this.selectedNodes.delete(node);
        if (this.selectedNode === node) {
            const remaining = [...this.selectedNodes];
            this.selectedNode = remaining[remaining.length - 1] ?? null;
            selectionChanged = true;
        }
        if (this.selectedPort?.node === node) {
            this.selectedPort = null;
            selectionChanged = true;
        }
        if (this.selectedLink !== null && removedLinks.includes(this.selectedLink)) {
            this.selectedLink = null;
            selectionChanged = true;
        }
        if (selectionChanged) this.emitSelectionChanged();
        for (const l of removedLinks) this.emit('linkRemoved', { link: l });
        this.emit('nodeRemoved', { node });
        this.scheduleDraw();
    }
    moveNode(id: string, x: number, y: number): void {
        const node = this.nodes.find((n) => n.id === id);
        if (node === undefined) return;
        const fromX = node.x, fromY = node.y;
        this.doMoveNode(id, x, y);
        if (fromX !== x || fromY !== y) {
            this.record({
                do:   () => { this.doMoveNode(id, x, y); },
                undo: () => { this.doMoveNode(id, fromX, fromY); },
                label: 'move node',
            });
        }
    }
    nudgeSelection(dx: number, dy: number): boolean {
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new RangeError('ssgraph: nudge delta must be finite');
        if ((dx === 0 && dy === 0) || this.selectedNodes.size === 0) return false;
        const moves = [...this.selectedNodes].map((node) => ({
            id: node.id,
            fromX: node.x,
            fromY: node.y,
            toX: node.x + dx,
            toY: node.y + dy,
        }));
        for (const move of moves) this.doMoveNode(move.id, move.toX, move.toY);
        this.record({
            do: () => { for (const move of moves) this.doMoveNode(move.id, move.toX, move.toY); },
            undo: () => { for (const move of moves) this.doMoveNode(move.id, move.fromX, move.fromY); },
            label: 'nudge',
        });
        return true;
    }
    private doMoveNode(id: string, x: number, y: number): void {
        const node = this.nodes.find((n) => n.id === id);
        if (node === undefined) return;
        node.x = x; node.y = y;
        this.layoutNode(node);
        this.emit('nodeMoved', { node });
        this.scheduleDraw();
    }
    addLink(init: LinkInit): boolean {
        const fullInit: LinkInit = {
            ...init,
            id: init.id ?? this.nextLinkId(),
            metadata: copyJsonObject(init.metadata),
        };
        if (fullInit.id !== undefined && this.links.some((link) => link.id === fullInit.id)) return false;
        const fromNode = this.nodes.find((node) => node.id === fullInit.from);
        const toNode = this.nodes.find((node) => node.id === fullInit.to);
        const fromPort = fromNode?.outPorts.find((port) => port.id === fullInit.fromPort);
        const toPort = toNode?.inPorts.find((port) => port.id === fullInit.toPort);
        if (fromNode !== undefined && toNode !== undefined && fromPort !== undefined && toPort !== undefined
            && toPort.isDynamic && toPort.dynamicMode === 'onConnect' && !toPort.isSibling) {
            const validation = this.validateLinkModels(fromNode, fromPort, toNode, toPort);
            this.emit('linkValidation', { fromNode, from: fromPort, toNode, to: toPort, ...validation });
            if (!validation.allowed) return false;
            const sibling = this.createDynamicSibling(toNode, toPort, fromPort);
            let added = false;
            const failed = new Error('ssgraph: dynamic link transaction failed');
            try {
                this.withTransaction('add dynamic link', () => {
                    if (!this.addPort(toNode.id, 'in', sibling)) throw failed;
                    added = this.addLinkApplied({ ...fullInit, toPort: sibling.id }, false);
                    if (!added) throw failed;
                });
            } catch (error) {
                if (error === failed) return false;
                throw error;
            }
            return added;
        }
        return this.addLinkApplied(fullInit, true);
    }
    private addLinkApplied(init: LinkInit, validate: boolean): boolean {
        const ok = this.doAddLink(init, validate);
        if (ok) {
            this.record({
                do:   () => { this.doAddLink(init, false); },
                undo: () => { this.doRemoveLink(init); },
                label: 'add link',
            });
        }
        return ok;
    }
    private doAddLink(init: LinkInit, validate = true, index = this.links.length): boolean {
        const fn = this.nodes.find((n) => n.id === init.from);
        const tn = this.nodes.find((n) => n.id === init.to);
        if (fn === undefined || tn === undefined) return false;
        const fp = fn.outPorts.find((p) => p.id === init.fromPort);
        const tp = tn.inPorts.find((p) => p.id === init.toPort);
        if (fp === undefined || tp === undefined) return false;
        if (validate) {
            const validation = this.validateLinkModels(fn, fp, tn, tp);
            this.emit('linkValidation', { fromNode: fn, from: fp, toNode: tn, to: tp, ...validation });
            if (!validation.allowed) return false;
        }
        const link = new LinkModel(init.from, init.fromPort, init.to, init.toPort, init.id ?? this.nextLinkId(), init.metadata);
        if (this.links.some((l) => l.id === link.id)) return false;
        this.links.splice(clamp(Math.trunc(index), 0, this.links.length), 0, link);
        this.emit('linkAdded', { link });
        this.scheduleDraw();
        return true;
    }
    removeLink(link: { id?: string; from: string; fromPort: string; to: string; toPort: string }): void {
        this.removeLinkInternal(link, true);
    }
    private removeLinkInternal(
        link: { id?: string; from: string; fromPort: string; to: string; toPort: string },
        pruneDynamicSibling: boolean,
    ): void {
        const key = new LinkModel(link.from, link.fromPort, link.to, link.toPort).key();
        const found = link.id === undefined || link.id.length === 0
            ? this.links.find((candidate) => candidate.key() === key)
            : this.links.find((candidate) => candidate.id === link.id);
        if (found === undefined) return;
        const init = found.toInit();
        const index = this.links.indexOf(found);
        const targetPort = this.findNode(found.to)?.inPorts.find((port) => port.id === found.toPort);
        const remove = (): void => {
            this.doRemoveLink(init);
            this.record({
                do:   () => { this.doRemoveLink(init); },
                undo: () => { this.doAddLink(init, false, index); },
                label: 'remove link',
            });
        };
        if (pruneDynamicSibling && targetPort?.isSibling === true) {
            this.withTransaction('remove dynamic link', () => {
                remove();
                this.pruneDynamicSibling(init.to, init.toPort);
            });
        } else {
            remove();
        }
    }
    private doRemoveLink(link: { from: string; fromPort: string; to: string; toPort: string }): void {
        const k = new LinkModel(link.from, link.fromPort, link.to, link.toPort).key();
        const found = this.links.find((l) => l.key() === k);
        if (found === undefined) return;
        this.links = this.links.filter((l) => l !== found);
        if (this.selectedLink === found) this.selectLink(null);
        this.emit('linkRemoved', { link: found });
        this.scheduleDraw();
    }
    private createDynamicSibling(toNode: NodeModel, anchor: PortModel, source: PortModel): PortInit {
        let sequence = 1;
        while (toNode.inPorts.some((port) => port.id === `${anchor.id}_${sequence}`)) sequence += 1;
        return {
            id: `${anchor.id}_${sequence}`,
            name: `${anchor.name} ${sequence}`,
            description: anchor.description,
            type: source.type || anchor.type,
            maxLinks: 1,
            availableTypes: [...anchor.availableTypes],
            isDynamic: false,
            dynamicMode: '',
            isSibling: true,
            metadata: copyJsonObject(anchor.metadata),
        };
    }
    private pruneDynamicSibling(nodeId: string, portId: string): void {
        const node = this.findNode(nodeId);
        const port = node?.inPorts.find((candidate) => candidate.id === portId);
        if (port?.isSibling !== true) return;
        if (this.links.some((link) => link.to === nodeId && link.toPort === portId)) return;
        this.removePort(nodeId, 'in', portId);
    }
    // ---- undo / redo public surface ---------------------------------
    canUndo(): boolean { return this.permissions.history && this.history.state.canUndo; }
    canRedo(): boolean { return this.permissions.history && this.history.state.canRedo; }
    undo(): void { if (this.permissions.history) this.history.undo(); }
    redo(): void { if (this.permissions.history) this.history.redo(); }
    cutSelection(): void {
        if (!this.permissions.copy || !this.permissions.deleteSelection) return;
        // The copy/delete pair is observable as ONE undo step.
        this.copySelection();
        this.withTransaction('cut', () => { this.deleteSelection(); });
    }
    // Group multiple mutations into one undo step (paste of N nodes,
    // bulk delete, multi-drag, etc.). Re-entrant: nested calls flatten
    // into the outer batch.
    withTransaction<T>(label: string, fn: () => T): T {
        return this.history.transaction(label, fn);
    }
    private record(action: AppliedAction): void {
        this.history.recordApplied({
            label: action.label,
            execute: action.do,
            undo: action.undo,
        });
    }
    deleteSelection(): void {
        if (!this.permissions.deleteSelection) return;
        if (this.selectedNodes.size > 0) {
            this.withTransaction('delete selection', () => {
                for (const id of [...this.selectedNodes].map((n) => n.id)) this.removeDiagramNode(id);
            });
            this.selectedNodes.clear();
            this.selectedNode = null;
            return;
        }
        if (this.selectedLink !== null) { this.removeLink(this.selectedLink); }
    }
    clear(): void {
        this.nodes = []; this.links = [];
        this.selectedNode = null; this.selectedNodes.clear(); this.selectedLink = null; this.selectedPort = null;
        this.documentMetadata = {};
        this.runtimeState = createDiagramRuntimeState();
        this.runtimePulse = 0;
        this.globalErrorFlashStart = null;
        this.history.clear();
        this.emitRuntimeStateChanged();
    }
    relink(
        linkId: string,
        next: Pick<LinkInit, 'from' | 'fromPort' | 'to' | 'toPort'>,
    ): LinkValidationResult {
        const link = this.links.find((candidate) => candidate.id === linkId);
        if (link === undefined) return { allowed: false, reason: 'missing-link' };

        const validation = this.validateLink(next, linkId);
        const fromNode = this.nodes.find((node) => node.id === next.from);
        const toNode = this.nodes.find((node) => node.id === next.to);
        const fromPort = fromNode?.outPorts.find((port) => port.id === next.fromPort);
        const toPort = toNode?.inPorts.find((port) => port.id === next.toPort);
        if (fromNode !== undefined && toNode !== undefined && fromPort !== undefined && toPort !== undefined) {
            this.emit('linkValidation', { fromNode, from: fromPort, toNode, to: toPort, ...validation });
        }
        if (!validation.allowed) return validation;

        const before = link.toInit();
        if (before.from === next.from && before.fromPort === next.fromPort
            && before.to === next.to && before.toPort === next.toPort) return validation;
        const dynamicSibling = fromPort !== undefined && toNode !== undefined && toPort !== undefined
            && toPort.isDynamic && toPort.dynamicMode === 'onConnect' && !toPort.isSibling
            ? this.createDynamicSibling(toNode, toPort, fromPort)
            : null;
        const after: LinkInit & { id: string } = {
            ...before,
            ...next,
            toPort: dynamicSibling?.id ?? next.toPort,
        };
        const oldTargetPort = this.findNode(before.to)?.inPorts.find((port) => port.id === before.toPort);
        const apply = (): void => {
            this.doRelink(linkId, after);
            this.record({
                do: () => { this.doRelink(linkId, after); },
                undo: () => { this.doRelink(linkId, before); },
                label: 'relink',
            });
        };
        const pruneOldSibling = oldTargetPort?.isSibling === true
            && (before.to !== after.to || before.toPort !== after.toPort);
        if (dynamicSibling !== null || pruneOldSibling) {
            this.withTransaction('relink dynamic link', () => {
                if (dynamicSibling !== null && !this.addPort(after.to, 'in', dynamicSibling)) {
                    throw new Error('ssgraph: could not create a dynamic sibling port');
                }
                apply();
                if (pruneOldSibling) this.pruneDynamicSibling(before.to, before.toPort);
            });
        } else {
            apply();
        }
        return validation;
    }
    private doRelink(linkId: string, next: LinkInit & { id: string }): void {
        const link = this.links.find((candidate) => candidate.id === linkId);
        if (link === undefined) return;
        const previous = link.toInit();
        link.from = next.from;
        link.fromPort = next.fromPort;
        link.to = next.to;
        link.toPort = next.toPort;
        this.emit('linkRelinked', { link, previous });
        this.scheduleDraw();
    }

    addPort(nodeId: string, direction: PortDirection, init: PortInit): boolean {
        const node = this.findNode(nodeId);
        if (node === undefined) return false;
        const ports = direction === 'in' ? node.inPorts : node.outPorts;
        if (ports.some((port) => port.id === init.id)) return false;
        return this.updateNodeState(nodeId, 'add port', (target) => {
            const list = direction === 'in' ? target.inPorts : target.outPorts;
            list.push(new PortModel(init, direction));
        });
    }

    removePort(nodeId: string, direction: PortDirection, portId: string): boolean {
        const node = this.findNode(nodeId);
        if (node === undefined) return false;
        const ports = direction === 'in' ? node.inPorts : node.outPorts;
        if (!ports.some((port) => port.id === portId)) return false;
        let changed = false;
        this.withTransaction('remove port', () => {
            const affected = this.links.filter((link) => direction === 'in'
                ? link.to === nodeId && link.toPort === portId
                : link.from === nodeId && link.fromPort === portId);
            for (const link of affected) this.removeLinkInternal(link, false);
            changed = this.updateNodeState(nodeId, 'remove port', (target) => {
                if (direction === 'in') target.inPorts = target.inPorts.filter((port) => port.id !== portId);
                else target.outPorts = target.outPorts.filter((port) => port.id !== portId);
            });
        });
        return changed;
    }

    updatePortType(nodeId: string, direction: PortDirection, portId: string, type: string): boolean {
        return this.updatePort(nodeId, direction, portId, { type });
    }

    updatePort(nodeId: string, direction: PortDirection, portId: string, patch: PortUpdate): boolean {
        const node = this.findNode(nodeId);
        const port = direction === 'in'
            ? node?.inPorts.find((candidate) => candidate.id === portId)
            : node?.outPorts.find((candidate) => candidate.id === portId);
        if (port === undefined) return false;
        if (patch.maxLinks !== undefined && (!Number.isInteger(patch.maxLinks) || patch.maxLinks < 0)) {
            throw new RangeError('ssgraph: port maxLinks must be a non-negative integer');
        }
        const compatibilityChanged = (patch.type !== undefined && patch.type !== port.type)
            || (patch.availableTypes !== undefined
                && JSON.stringify(patch.availableTypes) !== JSON.stringify(port.availableTypes));
        let changed = false;
        this.withTransaction('update port', () => {
            changed = this.updateNodeState(nodeId, 'update port', (target) => {
                const targetPort = direction === 'in'
                    ? target.inPorts.find((candidate) => candidate.id === portId)
                    : target.outPorts.find((candidate) => candidate.id === portId);
                if (targetPort === undefined) return;
                if (patch.name !== undefined) targetPort.name = patch.name;
                if (patch.description !== undefined) targetPort.description = patch.description;
                if (patch.type !== undefined) targetPort.type = patch.type;
                if (patch.maxLinks !== undefined) targetPort.maxLinks = patch.maxLinks;
                if (patch.availableTypes !== undefined) targetPort.availableTypes = [...patch.availableTypes];
                if (patch.isDynamic !== undefined) targetPort.isDynamic = patch.isDynamic;
                if (patch.dynamicMode !== undefined) targetPort.dynamicMode = patch.dynamicMode;
                if (patch.isSibling !== undefined) targetPort.isSibling = patch.isSibling;
                if (patch.metadata !== undefined) targetPort.metadata = copyJsonObject(patch.metadata);
            });
            if (changed && compatibilityChanged) {
                this.removeIncompatibleLinks((link) => direction === 'in'
                    ? link.to === nodeId && link.toPort === portId
                    : link.from === nodeId && link.fromPort === portId);
            }
        });
        return changed;
    }

    setNodePorts(nodeId: string, inPorts: readonly PortInit[], outPorts: readonly PortInit[]): boolean {
        const node = this.findNode(nodeId);
        if (node === undefined) return false;
        const inputIds = new Set(inPorts.map((port) => port.id));
        const outputIds = new Set(outPorts.map((port) => port.id));
        let changed = false;
        this.withTransaction('set node ports', () => {
            const invalid = this.links.filter((link) =>
                (link.to === nodeId && !inputIds.has(link.toPort))
                || (link.from === nodeId && !outputIds.has(link.fromPort)));
            for (const link of invalid) this.removeLinkInternal(link, false);
            changed = this.updateNodeState(nodeId, 'set node ports', (target) => {
                target.inPorts = inPorts.map((port) => new PortModel(port, 'in'));
                target.outPorts = outPorts.map((port) => new PortModel(port, 'out'));
            });
            if (changed) {
                this.removeIncompatibleLinks((link) => link.from === nodeId || link.to === nodeId);
            }
        });
        return changed;
    }

    updateNode(
        nodeId: string,
        patch: Partial<Pick<DiagramNodeInit, 'name' | 'description' | 'color' | 'border' | 'message' | 'openAction'>>,
    ): boolean {
        return this.updateNodeState(nodeId, 'update node', (node) => {
            if (patch.name !== undefined) node.name = patch.name;
            if (patch.description !== undefined) node.description = patch.description;
            if (patch.color !== undefined) node.color = patch.color;
            if (patch.border !== undefined) node.border = patch.border;
            if (patch.message !== undefined) node.message = patch.message;
            if (patch.openAction !== undefined) node.openAction = patch.openAction;
        });
    }

    setNodeParamValue(nodeId: string, name: string, value: string | undefined): boolean {
        return this.updateNodeState(nodeId, 'set node parameter', (node) => {
            if (value === undefined) delete node.paramValues[name];
            else node.paramValues[name] = value;
        });
    }

    setShowNodeMessages(show: boolean): void {
        this.showNodeMessages = show;
        this.scheduleDraw();
    }

    private updateNodeState(nodeId: string, label: string, mutate: (node: NodeModel) => void): boolean {
        const node = this.findNode(nodeId);
        if (node === undefined) return false;
        const before = node.toInit(false);
        mutate(node);
        if (this.reconcileSelectedPort(node)) this.emitSelectionChanged();
        const after = node.toInit(false);
        if (JSON.stringify(before) === JSON.stringify(after)) return false;
        this.layoutNode(node);
        this.emit('nodeChanged', { node });
        this.scheduleDraw();
        this.record({
            do: () => { this.applyNodeSnapshot(nodeId, after); },
            undo: () => { this.applyNodeSnapshot(nodeId, before); },
            label,
        });
        return true;
    }

    private applyNodeSnapshot(nodeId: string, snapshot: DiagramNodeInit): void {
        const node = this.findNode(nodeId);
        if (node === undefined) return;
        const restored = new NodeModel(snapshot, nodeId);
        node.typeId = restored.typeId;
        node.name = restored.name;
        node.description = restored.description;
        node.groupName = restored.groupName;
        node.color = restored.color;
        node.border = restored.border;
        node.icon = restored.icon;
        node.openAction = restored.openAction;
        node.message = restored.message;
        node.parameters = restored.parameters;
        node.paramValues = restored.paramValues;
        node.metadata = restored.metadata;
        node.isPlaceholder = restored.isPlaceholder;
        node.x = restored.x;
        node.y = restored.y;
        node.inPorts = restored.inPorts;
        node.outPorts = restored.outPorts;
        if (this.reconcileSelectedPort(node)) this.emitSelectionChanged();
        this.layoutNode(node);
        this.emit('nodeChanged', { node });
        this.scheduleDraw();
    }

    private reconcileSelectedPort(node: NodeModel): boolean {
        if (this.selectedPort?.node !== node) return false;
        const selected = this.selectedPort.port;
        const ports = selected.direction === 'in' ? node.inPorts : node.outPorts;
        const replacement = ports.find((port) => port.id === selected.id);
        if (replacement === selected) return false;
        this.selectedPort = replacement === undefined ? null : { node, port: replacement };
        return true;
    }
    load(nodes: DiagramNodeInit[], links: LinkInit[]): void {
        this.clear();
        this.idSeq = 1;
        this.linkSeq = 1;
        // Initial load is "model seed" — should NOT be undoable, and
        // shouldn't leave the user with 12 entries to Ctrl+Z through
        // before their stack reaches their first real action.
        for (const node of nodes) {
            const id = node.id ?? this.nextNodeId();
            this.doAddNode({ ...node, id });
        }
        for (const link of links) {
            const id = link.id ?? this.nextLinkId();
            if (this.links.some((existing) => existing.id === id)) {
                throw new Error(`ssgraph: duplicate link id "${id}"`);
            }
            const model = new LinkModel(link.from, link.fromPort, link.to, link.toPort, id, link.metadata);
            if (!this.links.some((existing) => existing.key() === model.key())) this.links.push(model);
        }
        for (const node of this.nodes) {
            if (node.loadError.length === 0) continue;
            const state = createDiagramNodeRuntimeState();
            state.error = { kind: 'load', message: node.loadError, pulse: ++this.runtimePulse };
            this.runtimeState.nodes[node.id] = state;
        }
        if (Object.keys(this.runtimeState.nodes).length > 0) this.emitRuntimeStateChanged();
        this.history.clear();
        this.emit('loadFinished', { nodes: this.nodes.slice(), links: this.links.slice() });
        this.zoomToFit();
        this.playIntro();
    }
    save(): DiagramSnapshot {
        return {
            nodes: this.nodes.map((node) => node.toInit(false) as DiagramNodeSnapshot),
            links: this.links.map((l) => ({ from: l.from, fromPort: l.fromPort, to: l.to, toPort: l.toPort })),
        };
    }

    loadDocument(source: DiagramDocument | string): void {
        const document = parseDiagramDocument(source);
        this.load(
            document.nodes,
            document.links.map((link) => ({
                id: link.id,
                from: link.from.nodeId,
                fromPort: link.from.portId,
                to: link.to.nodeId,
                toPort: link.to.portId,
                metadata: link.metadata,
            })),
        );
        this.documentMetadata = copyJsonObject(document.metadata);
    }

    saveDocument(): DiagramDocument {
        return createDiagramDocument({
            nodes: this.nodes.map((node) => node.toInit(false)),
            links: this.links.map((link) => ({
                id: link.id,
                from: { nodeId: link.from, portId: link.fromPort },
                to: { nodeId: link.to, portId: link.toPort },
                metadata: link.metadata,
            })),
            metadata: this.documentMetadata,
        });
    }
    selectedNodeId(): string | null { return this.selectedNode?.id ?? null; }
    getSelection(): DiagramSelection {
        return {
            nodeIds: [...this.selectedNodes].map((node) => node.id),
            linkIds: this.selectedLink === null ? [] : [this.selectedLink.id],
            port: this.selectedPort === null ? null : {
                nodeId: this.selectedPort.node.id,
                portId: this.selectedPort.port.id,
                direction: this.selectedPort.port.direction,
            },
            primaryNodeId: this.selectedNode?.id ?? null,
            primaryLinkId: this.selectedLink?.id ?? null,
        };
    }
    selectNodesById(ids: readonly string[]): void {
        const wanted = new Set(ids);
        this.setSelection(this.nodes.filter((node) => wanted.has(node.id)));
    }
    selectLinkById(id: string | null): void {
        this.selectLink(id === null ? null : (this.links.find((link) => link.id === id) ?? null));
    }
    selectPortById(nodeId: string, direction: PortDirection, portId: string): void {
        const node = this.findNode(nodeId);
        const port = direction === 'in'
            ? node?.inPorts.find((candidate) => candidate.id === portId)
            : node?.outPorts.find((candidate) => candidate.id === portId);
        if (node !== undefined && port !== undefined) this.selectPort({ node, port });
    }
    getViewState(): DiagramViewState {
        return {
            zoom: this.scale,
            panX: this.offX,
            panY: this.offY,
            overviewVisible: this.overviewVisible,
        };
    }
    setViewState(state: DiagramViewState): void {
        this.scale = clamp(state.zoom, ZOOM_MIN, ZOOM_MAX);
        this.offX = state.panX;
        this.offY = state.panY;
        this.overviewVisible = state.overviewVisible;
        this.emitViewChanged(true);
        this.scheduleDraw();
    }
    // Compat helpers used by the ssdiagram shim. They expose internal
    // state the host loop already touches via private members; keeping
    // them on the public class avoids reaching into
    // private fields with `as unknown` from outside.
    findNode(id: string): NodeModel | undefined { return this.nodes.find((n) => n.id === id); }
    requestRedraw(): void { this.relayout(); this.scheduleDraw(); }
    /**
     * Creates a detached canvas. With no options it is an exact copy of the
     * current frame, matching Charts.takeScreenshot(). Content scope renders
     * the whole graph without changing the visible viewport.
     */
    takeScreenshot(options: DiagramScreenshotOptions = {}): HTMLCanvasElement {
        if (this.destroyed) throw new Error('ssgraph: cannot export a destroyed diagram');
        const scope = options.scope ?? 'viewport';
        if (scope !== 'viewport' && scope !== 'content') {
            throw new RangeError(`ssgraph: unsupported screenshot scope "${String(scope)}"`);
        }

        if (scope === 'viewport' && Object.keys(options).length === 0) {
            const copy = document.createElement('canvas');
            copy.width = this.canvas.width;
            copy.height = this.canvas.height;
            const copyContext = copy.getContext('2d');
            if (copyContext === null) throw new Error('ssgraph: screenshot 2d context unavailable');
            copyContext.drawImage(this.canvas, 0, 0);
            return copy;
        }

        const pixelRatio = this.positiveScreenshotNumber(options.pixelRatio ?? this.dpr, 'pixelRatio');
        const exportScale = scope === 'content'
            ? this.positiveScreenshotNumber(options.scale ?? 1, 'scale')
            : this.scale;
        const padding = scope === 'content'
            ? this.nonNegativeScreenshotNumber(options.padding ?? 32, 'padding')
            : 0;
        const bounds = scope === 'content' ? this.graphBounds() : null;
        const width = scope === 'content'
            ? Math.max(1, Math.ceil(((bounds?.maxX ?? 1) - (bounds?.minX ?? 0)) * exportScale + padding * 2))
            : this.width;
        const height = scope === 'content'
            ? Math.max(1, Math.ceil(((bounds?.maxY ?? 1) - (bounds?.minY ?? 0)) * exportScale + padding * 2))
            : this.height;
        const pixelWidth = Math.ceil(width * pixelRatio);
        const pixelHeight = Math.ceil(height * pixelRatio);
        if (pixelWidth > 16384 || pixelHeight > 16384 || pixelWidth * pixelHeight > 268_435_456) {
            throw new RangeError(`ssgraph: screenshot is too large (${pixelWidth}x${pixelHeight})`);
        }

        const output = document.createElement('canvas');
        output.width = pixelWidth;
        output.height = pixelHeight;
        output.style.width = `${width}px`;
        output.style.height = `${height}px`;
        const outputContext = output.getContext('2d');
        if (outputContext === null) throw new Error('ssgraph: screenshot 2d context unavailable');

        const previous = {
            ctx: this.ctx,
            width: this.width,
            height: this.height,
            dpr: this.dpr,
            scale: this.scale,
            offX: this.offX,
            offY: this.offY,
            overviewVisible: this.overviewVisible,
            background: this.opts.background,
        };
        try {
            this.ctx = outputContext;
            this.width = width;
            this.height = height;
            this.dpr = pixelRatio;
            this.scale = exportScale;
            this.offX = scope === 'content' && bounds !== null ? padding - bounds.minX * exportScale : previous.offX;
            this.offY = scope === 'content' && bounds !== null ? padding - bounds.minY * exportScale : previous.offY;
            this.overviewVisible = options.includeOverview ?? (scope === 'viewport' && previous.overviewVisible);
            if (options.background !== undefined) this.opts.background = options.background;
            outputContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            this.draw({
                grid: options.includeGrid ?? true,
                overview: this.overviewVisible,
                selection: options.includeSelection ?? scope === 'viewport',
                runtime: options.includeRuntimeState ?? true,
                transient: false,
            });
        } finally {
            this.ctx = previous.ctx;
            this.width = previous.width;
            this.height = previous.height;
            this.dpr = previous.dpr;
            this.scale = previous.scale;
            this.offX = previous.offX;
            this.offY = previous.offY;
            this.overviewVisible = previous.overviewVisible;
            this.opts.background = previous.background;
        }
        return output;
    }

    private positiveScreenshotNumber(value: number, name: string): number {
        if (!Number.isFinite(value) || value <= 0) {
            throw new RangeError(`ssgraph: screenshot ${name} must be a positive finite number`);
        }
        return value;
    }

    private nonNegativeScreenshotNumber(value: number, name: string): number {
        if (!Number.isFinite(value) || value < 0) {
            throw new RangeError(`ssgraph: screenshot ${name} must be a non-negative finite number`);
        }
        return value;
    }
    getRuntimeState(): DiagramRuntimeState {
        return cloneDiagramRuntimeState(this.runtimeState);
    }
    setRuntimeState(state: DiagramRuntimeState): void {
        const previous = this.runtimeState;
        this.runtimeState = cloneDiagramRuntimeState(state);
        if (this.runtimeState.globalError === null) {
            this.globalErrorFlashStart = null;
        } else if (previous.globalError?.pulse !== this.runtimeState.globalError.pulse) {
            this.globalErrorFlashStart = performance.now();
        }
        this.runtimePulse = Math.max(
            this.runtimePulse,
            this.runtimeState.globalError?.pulse ?? 0,
            ...Object.values(this.runtimeState.nodes).map((node) => node.error?.pulse ?? 0),
        );
        for (const node of this.nodes) {
            const error = this.runtimeState.nodes[node.id]?.error ?? null;
            const previousError = previous.nodes[node.id]?.error ?? null;
            node.runtimeError = error?.kind === 'runtime' ? error.message : '';
            node.loadError = error?.kind === 'load' ? error.message : '';
            if (error?.kind === 'runtime') {
                if (previousError?.kind !== 'runtime' || previousError.pulse !== error.pulse) {
                    node.errorFlashStart = performance.now();
                }
            } else {
                node.errorFlashStart = null;
            }
        }
        this.emitRuntimeStateChanged();
    }
    clearRuntimeState(): void {
        this.setRuntimeState(createDiagramRuntimeState());
    }
    setActiveNode(nodeId: string | null): boolean {
        if (nodeId !== null && this.findNode(nodeId) === undefined) return false;
        const state = this.getRuntimeState();
        state.activeNodeId = nodeId;
        this.setRuntimeState(state);
        return true;
    }
    setPortRuntimeState(
        nodeId: string,
        direction: PortDirection,
        portId: string,
        patch: Partial<DiagramPortRuntimeState>,
    ): boolean {
        const node = this.findNode(nodeId);
        const port = direction === 'in'
            ? node?.inPorts.find((candidate) => candidate.id === portId)
            : node?.outPorts.find((candidate) => candidate.id === portId);
        if (node === undefined || port === undefined) return false;
        const state = this.getRuntimeState();
        const nodeState = state.nodes[nodeId] ?? createDiagramNodeRuntimeState();
        state.nodes[nodeId] = nodeState;
        const current = nodeState.ports[direction][portId] ?? createDiagramPortRuntimeState();
        nodeState.ports[direction][portId] = { ...current, ...patch };
        this.setRuntimeState(state);
        return true;
    }
    setGlobalError(message: string | null, kind: DiagramGlobalErrorKind = 'invalid'): void {
        const state = this.getRuntimeState();
        state.globalError = message === null || message.length === 0
            ? null
            : { kind, message, pulse: ++this.runtimePulse };
        this.setRuntimeState(state);
    }
    setNodeError(id: string, message: string, options: NodeErrorOptions = {}): boolean {
        const node = this.findNode(id);
        if (node === undefined) return false;
        const kind = options.kind ?? 'runtime';
        if (kind === 'load') {
            node.loadError = message;
        } else {
            node.runtimeError = message;
            node.errorFlashStart = message.length > 0 && options.animate !== false
                ? performance.now()
                : null;
        }
        const state = this.getRuntimeState();
        const nodeState = state.nodes[id] ?? createDiagramNodeRuntimeState();
        state.nodes[id] = nodeState;
        nodeState.error = message.length === 0 ? null : { kind, message, pulse: ++this.runtimePulse };
        this.runtimeState = state;
        this.emitRuntimeStateChanged();
        return true;
    }
    clearNodeError(id: string, kind?: NodeErrorKind): boolean {
        const node = this.findNode(id);
        if (node === undefined) return false;
        if (kind === undefined || kind === 'runtime') {
            node.runtimeError = '';
            node.errorFlashStart = null;
        }
        if (kind === undefined || kind === 'load') node.loadError = '';
        const state = this.getRuntimeState();
        const nodeState = state.nodes[id];
        if (nodeState !== undefined && (kind === undefined || nodeState.error?.kind === kind)) {
            nodeState.error = node.runtimeError.length > 0
                ? { kind: 'runtime', message: node.runtimeError, pulse: ++this.runtimePulse }
                : node.loadError.length > 0
                    ? { kind: 'load', message: node.loadError, pulse: ++this.runtimePulse }
                    : null;
        }
        this.runtimeState = state;
        this.emitRuntimeStateChanged();
        return true;
    }
    private emitRuntimeStateChanged(): void {
        this.emit('runtimeStateChanged', { state: this.getRuntimeState() });
        this.scheduleDraw();
    }
    viewToWorld(sx: number, sy: number): [number, number] { return this.toWorld(sx, sy); }
    selectNodeById(id: string | null): void {
        const node = id === null ? null : (this.nodes.find((n) => n.id === id) ?? null);
        this.selectNode(node);
    }

    setZoom(scale: number): void {
        const cx = this.width / 2;
        const cy = this.height / 2;
        const wx = (cx - this.offX) / this.scale;
        const wy = (cy - this.offY) / this.scale;
        this.scale = clamp(scale, ZOOM_MIN, ZOOM_MAX);
        this.offX = cx - wx * this.scale;
        this.offY = cy - wy * this.scale;
        this.emitViewChanged(true);
        this.scheduleDraw();
    }
    zoomToFit(): void {
        const gb = this.graphBounds();
        if (gb === null) { this.scale = 1; this.offX = 0; this.offY = 0; this.emitViewChanged(true); this.scheduleDraw(); return; }
        const pad = 40;
        const gw = (gb.maxX - gb.minX) + pad * 2;
        const gh = (gb.maxY - gb.minY) + pad * 2;
        // Cap at 1.0 — never blow a small graph up past 100%.
        this.scale = clamp(Math.min(this.width / gw, this.height / gh), ZOOM_MIN, 1);
        this.offX = (this.width - (gb.maxX + gb.minX) * this.scale) / 2;
        this.offY = (this.height - (gb.maxY + gb.minY) * this.scale) / 2;
        this.emitViewChanged(true);
        this.scheduleDraw();
    }
    // Entrance animation: the whole scheme rises from below + fades in.
    playIntro(): void { this.introStart = performance.now(); this.scheduleDraw(); }
    setOverviewVisible(v: boolean): void {
        if (this.overviewVisible === v) return;
        this.overviewVisible = v;
        this.emitViewChanged(false);
        this.scheduleDraw();
    }
    setTypeColors(colors: Readonly<Record<string, string>>): void {
        this.opts.typeColors = { ...colors };
        this.scheduleDraw();
    }
    setTheme(t: {
        background?: string;
        gridColor?: string;
        linkMaxLightness?: number;
        overviewBackground?: string;
        overviewBorderColor?: string;
        overviewViewportColor?: string;
        overviewViewportFill?: string;
    }): void {
        if (t.background !== undefined) this.opts.background = t.background;
        if (t.gridColor !== undefined) this.opts.gridColor = t.gridColor;
        if (t.linkMaxLightness !== undefined) this.opts.linkMaxLightness = t.linkMaxLightness;
        if (t.overviewBackground !== undefined) this.opts.overviewBackground = t.overviewBackground;
        if (t.overviewBorderColor !== undefined) this.opts.overviewBorderColor = t.overviewBorderColor;
        if (t.overviewViewportColor !== undefined) this.opts.overviewViewportColor = t.overviewViewportColor;
        if (t.overviewViewportFill !== undefined) this.opts.overviewViewportFill = t.overviewViewportFill;
        this.scheduleDraw();
    }
    private graphBounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
        if (this.nodes.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const n of this.nodes) {
            minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
        }
        return { minX, minY, maxX, maxY };
    }
    resize(w: number, h: number): void {
        if (w < 2 || h < 2) return;
        this.width = w; this.height = h;
        this.dpr = window.devicePixelRatio || 1;
        this.canvas.width = Math.round(w * this.dpr);
        this.canvas.height = Math.round(h * this.dpr);
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.scheduleDraw();
    }
    getInteractionPermissions(): DiagramInteractionPermissions {
        return { ...this.permissions };
    }
    setInteractionPermissions(patch: Partial<DiagramInteractionPermissions>): void {
        this.permissions = { ...this.permissions, ...patch };
        if (!this.permissions.select) {
            this.selectedNode = null;
            this.selectedNodes.clear();
            this.selectedLink = null;
            this.selectedPort = null;
            this.emitSelectionChanged();
        }
        this.emit('undoStackChanged', { canUndo: this.canUndo(), canRedo: this.canRedo() });
        this.scheduleDraw();
    }
    /** View-only mode keeps selection, inspection and copy enabled. */
    setReadOnly(value: boolean): void {
        this.permissions = value
            ? createReadOnlyDiagramPermissions()
            : createEditableDiagramPermissions();
        this.emit('undoStackChanged', { canUndo: this.canUndo(), canRedo: this.canRedo() });
        this.scheduleDraw();
    }
    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.cancelLongPress();
        if (this.tipTimer !== null) {
            clearTimeout(this.tipTimer);
            this.tipTimer = null;
        }
        for (const dispose of this.domDisposables.splice(0).reverse()) dispose();
        this.handlers.clear();
        this.iconCache.clear();
        this.canvas.remove();
    }

    // ---- geometry ---------------------------------------------------
    private layoutNode(n: NodeModel): void {
        const ctx = this.ctx;
        ctx.font = '600 12px Segoe UI, Tahoma, sans-serif';
        const titleW = ctx.measureText(n.name).width;
        const rows = Math.max(n.inPorts.length, n.outPorts.length, 1);
        // Node sizing: min 170 wide, height grows by rows.
        n.w = Math.max(170, Math.ceil(titleW) + 28);
        n.h = Math.max(48, rows * PORT_ROW_H + 16);
        // Each side's port stack is vertically centred; the socket
        // square sits OUTSIDE the body (its inner edge flush with the
        // node border).
        const off = PORT_SQ / 2;
        const place = (ports: PortModel[], x: number): void => {
            const startY = n.y + (n.h - ports.length * PORT_ROW_H) / 2 + PORT_ROW_H / 2;
            ports.forEach((p, i) => { p.cx = x; p.cy = startY + i * PORT_ROW_H; });
        };
        place(n.inPorts, n.x - off);
        place(n.outPorts, n.x + n.w + off);
    }
    private relayout(): void { for (const n of this.nodes) this.layoutNode(n); }

    private toScreen(wx: number, wy: number): [number, number] {
        return [wx * this.scale + this.offX, wy * this.scale + this.offY];
    }
    private toWorld(sx: number, sy: number): [number, number] {
        return [(sx - this.offX) / this.scale, (sy - this.offY) / this.scale];
    }
    private portColor(type: string): string {
        const maxL = this.opts.linkMaxLightness;
        const light = maxL !== undefined && maxL < 0.5;
        if (type === '') return light ? '#585c62' : '#9aa0a6';
        const map = this.opts.typeColors ?? {};
        const base = map[type] ?? `hsl(${hashHue(type)}, 62%, 58%)`;
        return maxL !== undefined ? clampLightness(base, maxL) : base;
    }

    // ---- hit testing (world coords) ---------------------------------
    private portAt(wx: number, wy: number): { node: NodeModel; port: PortModel } | null {
        for (let i = this.nodes.length - 1; i >= 0; i -= 1) {
            const n = this.nodes[i];
            for (const p of [...n.inPorts, ...n.outPorts]) {
                if ((wx - p.cx) ** 2 + (wy - p.cy) ** 2 <= (PORT_R + 4) ** 2) return { node: n, port: p };
            }
        }
        return null;
    }
    private selectedLinkEndpointAt(wx: number, wy: number): 'from' | 'to' | null {
        if (this.selectedLink === null) return null;
        const radius = (PORT_R + 7) / this.scale;
        for (const end of ['from', 'to'] as const) {
            const point = this.endpoint(this.selectedLink, end);
            if (point !== null && (wx - point[0]) ** 2 + (wy - point[1]) ** 2 <= radius ** 2) return end;
        }
        return null;
    }
    private directRelinkAtPort(node: NodeModel, port: PortModel): {
        link: LinkModel;
        end: 'from' | 'to';
    } | null {
        if (port.direction !== 'in') return null;
        const incoming = this.links.filter((link) => link.to === node.id && link.toPort === port.id);
        return incoming.length === 1 ? { link: incoming[0], end: 'to' } : null;
    }
    private nodeAt(wx: number, wy: number): NodeModel | null {
        for (let i = this.nodes.length - 1; i >= 0; i -= 1) {
            const n = this.nodes[i];
            if (wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + n.h) return n;
        }
        return null;
    }
    // Other nodes (not the link's own endpoints) become obstacles,
    // inflated so links keep a little clearance — the AvoidsNodes margin.
    private obstaclesFor(exclude: Set<string>): Rect[] {
        const inf = 12;
        const out: Rect[] = [];
        for (const n of this.nodes) {
            if (exclude.has(n.id)) continue;
            out.push([n.x - inf, n.y - inf, n.w + inf * 2, n.h + inf * 2]);
        }
        return out;
    }
    private routeLink(a: [number, number], b: [number, number], exclude: Set<string>): number[][] {
        return routeAvoid(a, b, this.obstaclesFor(exclude));
    }
    private linkAt(wx: number, wy: number): LinkModel | null {
        const tol = 5 / this.scale;
        // topmost first so the hovered/selected one wins
        for (let i = this.links.length - 1; i >= 0; i -= 1) {
            const l = this.links[i];
            const a = this.endpoint(l, 'from');
            const b = this.endpoint(l, 'to');
            if (a === null || b === null) continue;
            const pts = this.routeLink(a, b, new Set([l.from, l.to]));
            for (let k = 1; k < pts.length; k += 1) {
                if (ptSegDist(wx, wy, pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]) <= tol) return l;
            }
        }
        return null;
    }
    private endpoint(l: LinkModel, end: 'from' | 'to'): [number, number] | null {
        const node = this.nodes.find((n) => n.id === (end === 'from' ? l.from : l.to));
        if (node === undefined) return null;
        const port = end === 'from'
            ? node.outPorts.find((p) => p.id === l.fromPort)
            : node.inPorts.find((p) => p.id === l.toPort);
        if (port === undefined) return null;
        return [port.cx, port.cy];
    }

    // ---- linking rules ----------------------------------------------
    validateLink(init: Pick<LinkInit, 'from' | 'fromPort' | 'to' | 'toPort'>, excludeLinkId?: string): LinkValidationResult {
        const fromNode = this.nodes.find((node) => node.id === init.from);
        const toNode = this.nodes.find((node) => node.id === init.to);
        if (fromNode === undefined || toNode === undefined) return { allowed: false, reason: 'missing-node' };
        const fromPort = fromNode.outPorts.find((port) => port.id === init.fromPort);
        const toPort = toNode.inPorts.find((port) => port.id === init.toPort);
        if (fromPort === undefined || toPort === undefined) return { allowed: false, reason: 'missing-port' };
        return this.validateLinkModels(fromNode, fromPort, toNode, toPort, excludeLinkId);
    }

    private validateLinkModels(
        fromNode: NodeModel,
        fromPort: PortModel,
        toNode: NodeModel,
        toPort: PortModel,
        excludeLinkId?: string,
    ): LinkValidationResult {
        if (fromNode === toNode) return { allowed: false, reason: 'same-node' };
        if (fromPort.direction !== 'out' || toPort.direction !== 'in') {
            return { allowed: false, reason: 'invalid-direction' };
        }
        const relevantLinks = this.links.filter((link) => link.id !== excludeLinkId);
        if (relevantLinks.some((link) => link.from === fromNode.id
            && link.fromPort === fromPort.id
            && link.to === toNode.id
            && link.toPort === toPort.id)) {
            return { allowed: false, reason: 'duplicate-link' };
        }
        if (fromPort.maxLinks > 0) {
            const used = relevantLinks.filter((link) => link.from === fromNode.id && link.fromPort === fromPort.id).length;
            if (used >= fromPort.maxLinks) return { allowed: false, reason: 'source-limit' };
        }
        if (toPort.maxLinks > 0) {
            const used = relevantLinks.filter((link) => link.to === toNode.id && link.toPort === toPort.id).length;
            if (used >= toPort.maxLinks) return { allowed: false, reason: 'target-limit' };
        }
        if (!arePortTypesCompatible(fromPort.type, toPort.type, toPort.availableTypes)) {
            return { allowed: false, reason: 'incompatible-type' };
        }
        if (this.validator !== null && !this.validator({ fromNode, fromPort, toNode, toPort })) {
            return { allowed: false, reason: 'host-rejected' };
        }
        return { allowed: true, reason: 'allowed' };
    }

    private removeIncompatibleLinks(matches: (link: LinkModel) => boolean): void {
        const incompatible = this.links.filter((link) => matches(link) && !this.canExistingLinkRemain(link));
        for (const link of incompatible) this.removeLinkInternal(link, true);
    }

    private canExistingLinkRemain(link: LinkModel): boolean {
        const fromNode = this.nodes.find((node) => node.id === link.from);
        const toNode = this.nodes.find((node) => node.id === link.to);
        const fromPort = fromNode?.outPorts.find((port) => port.id === link.fromPort);
        const toPort = toNode?.inPorts.find((port) => port.id === link.toPort);
        if (fromNode === undefined || toNode === undefined || fromPort === undefined || toPort === undefined) {
            return false;
        }
        if (!arePortTypesCompatible(fromPort.type, toPort.type, toPort.availableTypes)) return false;
        return this.validator === null || this.validator({ fromNode, fromPort, toNode, toPort });
    }
    // Plug↔socket magnet: while dragging from an out-port, find the
    // nearest in-port (within SNAP_PX, screen space) the link is allowed
    // to land on. Returns null when none is close → the pending link
    // detaches and follows the cursor again.
    private findSnap(): { node: NodeModel; port: PortModel } | null {
        if (this.linking === null && this.relinking === null) return null;
        let direction: PortDirection;
        let accepts: (node: NodeModel, port: PortModel) => boolean;
        if (this.linking !== null) {
            const source = this.linking;
            direction = 'in';
            accepts = (node, port) => this.validateLinkModels(source.node, source.port, node, port).allowed;
        } else {
            const gesture = this.relinking!;
            if (gesture.end === 'to') {
                const sourceNode = this.nodes.find((node) => node.id === gesture.link.from);
                const sourcePort = sourceNode?.outPorts.find((port) => port.id === gesture.link.fromPort);
                if (sourceNode === undefined || sourcePort === undefined) return null;
                direction = 'in';
                accepts = (node, port) => this.validateLinkModels(
                    sourceNode, sourcePort, node, port, gesture.link.id,
                ).allowed;
            } else {
                const targetNode = this.nodes.find((node) => node.id === gesture.link.to);
                const targetPort = targetNode?.inPorts.find((port) => port.id === gesture.link.toPort);
                if (targetNode === undefined || targetPort === undefined) return null;
                direction = 'out';
                accepts = (node, port) => this.validateLinkModels(
                    node, port, targetNode, targetPort, gesture.link.id,
                ).allowed;
            }
        }
        let best: { node: NodeModel; port: PortModel } | null = null;
        let bestD = SNAP_PX;
        for (const n of this.nodes) {
            const ports = direction === 'in' ? n.inPorts : n.outPorts;
            for (const p of ports) {
                if (!accepts(n, p)) continue;
                const [sx, sy] = this.toScreen(p.cx, p.cy);
                const dpx = Math.hypot(sx - this.cursor.x, sy - this.cursor.y);
                if (dpx <= bestD) { bestD = dpx; best = { node: n, port: p }; }
            }
        }
        return best;
    }

    private selectNode(n: NodeModel | null): void {
        this.selectedLink = null;
        this.selectedPort = null;
        this.selectedNodes.clear();
        if (n !== null) this.selectedNodes.add(n);
        this.selectedNode = n;
        this.emit('nodeSelected', { node: n, selected: n !== null });
        this.emitSelectionChanged();
        this.scheduleDraw();
    }
    private toggleSelect(n: NodeModel): void {
        this.selectedLink = null;
        this.selectedPort = null;
        if (this.selectedNodes.has(n)) {
            this.selectedNodes.delete(n);
            if (this.selectedNode === n) this.selectedNode = null;
        } else {
            this.selectedNodes.add(n);
            this.selectedNode = n;
        }
        this.emit('nodeSelected', { node: this.selectedNode, selected: this.selectedNodes.size > 0 });
        this.emitSelectionChanged();
        this.scheduleDraw();
    }
    private setSelection(ns: NodeModel[]): void {
        this.selectedLink = null;
        this.selectedPort = null;
        this.selectedNodes = new Set(ns);
        this.selectedNode = ns.length > 0 ? ns[ns.length - 1] : null;
        this.emit('nodeSelected', { node: this.selectedNode, selected: ns.length > 0 });
        this.emitSelectionChanged();
        this.scheduleDraw();
    }
    private selectLink(l: LinkModel | null): void {
        if (this.selectedLink === l) return;
        this.selectedNode = null;
        this.selectedNodes.clear();
        this.selectedPort = null;
        this.selectedLink = l;
        this.emit('linkSelected', { link: l, selected: l !== null });
        this.emitSelectionChanged();
        this.scheduleDraw();
    }
    private selectPort(target: { node: NodeModel; port: PortModel }): void {
        this.selectedPort = target;
        this.emit('portSelected', target);
        this.emitSelectionChanged();
        this.scheduleDraw();
    }
    private emitSelectionChanged(): void {
        this.emit('selectionChanged', this.getSelection());
    }
    // ---- clipboard (copy / paste of the selection) ------------------
    copySelection(): void {
        this.copySelectionDocument();
    }
    copySelectionDocument(): DiagramDocument | null {
        if (!this.permissions.copy) return null;
        if (this.selectedNodes.size === 0) { this.clip = null; return null; }
        const ids = new Set([...this.selectedNodes].map((n) => n.id));
        const all = this.saveDocument();
        this.clip = createDiagramDocument({
            nodes: all.nodes.filter((n) => ids.has(n.id)),
            links: all.links.filter((link) => ids.has(link.from.nodeId) && ids.has(link.to.nodeId)),
        });
        return parseDiagramDocument(this.clip);
    }
    hasClipboard(): boolean {
        return this.clip !== null && this.clip.nodes.length > 0;
    }
    getClipboardDocument(): DiagramDocument | null {
        return this.clip === null ? null : parseDiagramDocument(this.clip);
    }
    setClipboardDocument(source: DiagramDocument | string): void {
        this.clip = parseDiagramDocument(source);
    }
    pasteSelection(): string[] {
        if (this.clip === null) return [];
        return this.pasteDocument(this.clip);
    }
    pasteDocument(source: DiagramDocument | string, offset?: { x: number; y: number }): string[] {
        if (!this.permissions.paste) return [];
        const clipboard = parseDiagramDocument(source);
        if (clipboard.nodes.length === 0) return [];
        const pasteOffset = offset ?? { x: this.gridSize, y: this.gridSize };
        this.clip = clipboard;
        const map = new Map<string, string>();
        const added: NodeModel[] = [];
        // Paste of N nodes + M links collapses into ONE undo step.
        this.withTransaction('paste', () => {
            for (const sn of clipboard.nodes) {
                const nid = this.nextNodeId();
                map.set(sn.id, nid);
                const id = this.addDiagramNode({
                    ...sn,
                    id: nid,
                    x: sn.x + pasteOffset.x,
                    y: sn.y + pasteOffset.y,
                });
                const nn = this.nodes.find((x) => x.id === id);
                if (nn !== undefined) added.push(nn);
            }
            for (const l of clipboard.links) {
                const f = map.get(l.from.nodeId);
                const t = map.get(l.to.nodeId);
                if (f !== undefined && t !== undefined)
                    this.addLink({
                        from: f,
                        fromPort: l.from.portId,
                        to: t,
                        toPort: l.to.portId,
                        metadata: l.metadata,
                    });
            }
        });
        this.setSelection(added);
        return added.map((node) => node.id);
    }

    // ---- input ------------------------------------------------------
    private cancelLongPress(): void {
        if (this.lpTimer !== null) { clearTimeout(this.lpTimer); this.lpTimer = null; }
        this.lpStart = null;
    }
    // Hit-test at screen coords and emit a contextMenu event. Cancels
    // any partial drag/rubber/link gesture that may have started — once
    // the menu opens we don't want a half-drag racing it.
    private fireContextMenu(sx: number, sy: number, pageX: number, pageY: number): void {
        const [wx, wy] = this.toWorld(sx, sy);
        const port = this.portAt(wx, wy);
        const node = port?.node ?? this.nodeAt(wx, wy);
        const link = port === null && node === null ? this.linkAt(wx, wy) : null;
        if (this.permissions.select) {
            if (port !== null) {
                const selectedLink = this.selectedLink;
                const isSelectedEndpoint = selectedLink !== null
                    && ((selectedLink.from === port.node.id && selectedLink.fromPort === port.port.id)
                        || (selectedLink.to === port.node.id && selectedLink.toPort === port.port.id));
                if (!isSelectedEndpoint && !this.selectedNodes.has(port.node)) this.selectNode(port.node);
                this.selectPort(port);
            } else if (node !== null && !this.selectedNodes.has(node)) this.selectNode(node);
            else if (link !== null && this.selectedLink !== link) this.selectLink(link);
        }
        this.dragNode = null; this.dragStart = []; this.rubber = null;
        this.panning = false; this.linking = null; this.relinking = null; this.relinkCandidate = null; this.linkSnap = null;
        this.scheduleDraw();
        this.emit('contextMenu', { x: pageX, y: pageY, link, node, port });
    }

    private listen<K extends keyof HTMLElementEventMap>(
        target: HTMLElement,
        type: K,
        listener: (event: HTMLElementEventMap[K]) => void,
        options?: boolean | AddEventListenerOptions,
    ): void;
    private listen<K extends keyof WindowEventMap>(
        target: Window,
        type: K,
        listener: (event: WindowEventMap[K]) => void,
        options?: boolean | AddEventListenerOptions,
    ): void;
    private listen(
        target: EventTarget,
        type: string,
        listener: EventListener,
        options?: boolean | AddEventListenerOptions,
    ): void {
        target.addEventListener(type, listener, options);
        this.domDisposables.push(() => target.removeEventListener(type, listener, options));
    }

    private bind(): void {
        const localXY = (e: MouseEvent | PointerEvent): [number, number] => {
            const r = this.canvas.getBoundingClientRect();
            return [e.clientX - r.left, e.clientY - r.top];
        };
        this.listen(this.canvas, 'pointerdown', (e) => {
            try { (this.canvas as Element).setPointerCapture(e.pointerId); } catch { /* unsupported */ }
            // Arm a long-press timer on every pointerdown. Cancelled by
            // move-beyond-tolerance, pointerup, or any other gesture.
            this.cancelLongPress();
            this.relinkCandidate = null;
            this.lpStart = { sx: e.clientX, sy: e.clientY, px: e.clientX, py: e.clientY };
            const downSx = e.clientX, downSy = e.clientY;
            const r0 = this.canvas.getBoundingClientRect();
            const localSx = downSx - r0.left, localSy = downSy - r0.top;
            this.lpTimer = setTimeout(() => {
                this.lpTimer = null;
                this.fireContextMenu(localSx, localSy, downSx, downSy);
            }, this.lpDelayMs);
            this.canvas.focus();
            const [sx, sy] = localXY(e);
            if (this.ovHit(sx, sy)) { this.ovDragging = true; this.ovPanTo(sx, sy); return; }
            if (!this.permissions.inspect) this.cancelLongPress();
            const [wx, wy] = this.toWorld(sx, sy);
            const selectedEndpoint = this.selectedLinkEndpointAt(wx, wy);
            if (e.button === 0 && this.permissions.createLinks && this.selectedLink !== null
                && selectedEndpoint !== null) {
                this.relinking = { link: this.selectedLink, end: selectedEndpoint };
                this.linking = null;
                this.linkSnap = null;
                this.cursor = { x: sx, y: sy };
                return;
            }
            const portHit = this.portAt(wx, wy);
            if (portHit !== null) {
                const selectedLink = this.selectedLink;
                const isFrom = selectedLink !== null
                    && portHit.port.direction === 'out'
                    && selectedLink.from === portHit.node.id
                    && selectedLink.fromPort === portHit.port.id;
                const isTo = selectedLink !== null
                    && portHit.port.direction === 'in'
                    && selectedLink.to === portHit.node.id
                    && selectedLink.toPort === portHit.port.id;
                if (this.permissions.inspect) {
                    if (this.permissions.select && !isFrom && !isTo && !this.selectedNodes.has(portHit.node)) {
                        this.selectNode(portHit.node);
                    }
                    this.selectPort(portHit);
                    if (e.button === 0 || e.button === 2) {
                        this.emit('portClicked', {
                            ...portHit,
                            action: e.button === 2 ? 'rightClick' : 'leftClick',
                            ctrlKey: e.ctrlKey,
                            shiftKey: e.shiftKey,
                            altKey: e.altKey,
                            metaKey: e.metaKey,
                        });
                    }
                }
                if (e.button !== 0) return;
                if (this.permissions.createLinks && selectedLink !== null) {
                    if (isFrom || isTo) {
                        this.relinking = { link: selectedLink, end: isFrom ? 'from' : 'to' };
                        this.linking = null;
                        this.linkSnap = null;
                        this.cursor = { x: sx, y: sy };
                        return;
                    }
                }
                // A single existing input link can be rewired in one drag
                // without a separate selection click.
                const directRelink = this.permissions.createLinks
                    ? this.directRelinkAtPort(portHit.node, portHit.port)
                    : null;
                if (directRelink !== null) {
                    this.relinkCandidate = { ...directRelink, sx, sy };
                    this.linking = null;
                    this.relinking = null;
                    this.linkSnap = null;
                    this.cursor = { x: sx, y: sy };
                    return;
                }
                // Other output sockets start an additional link; input sockets
                // consume the gesture so they never drag the whole diagram.
                if (this.permissions.createLinks && portHit.port.direction === 'out') {
                    this.linking = portHit;
                    this.relinking = null;
                    this.linkSnap = null;
                    this.cursor = { x: sx, y: sy };
                }
                return;
            }
            const node = this.nodeAt(wx, wy);
            if (node !== null) {
                const add = e.shiftKey || e.ctrlKey || e.metaKey;
                if (this.permissions.select) {
                    if (add) { this.toggleSelect(node); return; }
                    if (!this.selectedNodes.has(node)) this.selectNode(node);
                }
                if (this.permissions.moveNodes) {
                    this.dragNode = node;
                    this.dragAnchor = { wx, wy };
                    const moving = this.selectedNodes.has(node) ? [...this.selectedNodes] : [node];
                    this.dragStart = moving.map((item) => ({ n: item, x: item.x, y: item.y }));
                    const selected = new Set(moving);
                    this.nodes = this.nodes.filter((item) => !selected.has(item)).concat(moving);
                }
                return;
            }
            const link = this.linkAt(wx, wy);
            if (link !== null) {
                if (this.permissions.select) this.selectLink(link);
                return;
            }
            // empty space: middle-button / Ctrl / Alt / touch = pan;
            // else rubber-band select. Touch always pans because mobile
            // users can't hold modifier keys and rubber-band drag-select
            // is awkward with a finger.
            const wantPan = !this.permissions.select || e.button === 1 || e.ctrlKey || e.altKey || e.pointerType === 'touch';
            if (wantPan) {
                if (this.permissions.select && !e.shiftKey) this.selectNode(null);
                this.panning = true; this.panX = sx; this.panY = sy;
            } else {
                if (!e.shiftKey) this.selectNode(null);
                this.rubber = { x0: wx, y0: wy, x: wx, y: wy };
            }
        });
        this.listen(this.canvas, 'pointermove', (e) => {
            const [sx, sy] = localXY(e);
            this.cursor = { x: sx, y: sy };
            // movement past tolerance → not a long-press anymore
            if (this.lpStart !== null) {
                const dx = e.clientX - this.lpStart.px;
                const dy = e.clientY - this.lpStart.py;
                if (Math.hypot(dx, dy) > this.lpMoveTol) this.cancelLongPress();
            }
            if (this.ovDragging) { this.ovPanTo(sx, sy); return; }
            const [wx, wy] = this.toWorld(sx, sy);
            if (this.relinkCandidate !== null) {
                const candidate = this.relinkCandidate;
                if (Math.hypot(sx - candidate.sx, sy - candidate.sy) <= RELINK_DRAG_THRESHOLD_PX) return;
                this.relinkCandidate = null;
                this.relinking = { link: candidate.link, end: candidate.end };
                if (this.permissions.select) this.selectLink(candidate.link);
                this.linkSnap = this.findSnap();
                this.scheduleDraw();
                return;
            }
            if (this.dragNode !== null) {
                let ddx = wx - this.dragAnchor.wx;
                let ddy = wy - this.dragAnchor.wy;
                if (this.gridSnapEnabled) {
                    const primary = this.dragStart.find((item) => item.n === this.dragNode);
                    if (primary !== undefined) {
                        ddx = Math.round((primary.x + ddx) / this.gridSize) * this.gridSize - primary.x;
                        ddy = Math.round((primary.y + ddy) / this.gridSize) * this.gridSize - primary.y;
                    }
                }
                for (const it of this.dragStart) {
                    it.n.x = it.x + ddx;
                    it.n.y = it.y + ddy;
                    this.layoutNode(it.n);
                }
                this.scheduleDraw();
                return;
            }
            if (this.rubber !== null) {
                this.rubber.x = wx; this.rubber.y = wy;
                this.scheduleDraw();
                return;
            }
            if (this.panning) {
                this.offX += sx - this.panX;
                this.offY += sy - this.panY;
                this.panX = sx; this.panY = sy;
                this.scheduleDraw();
                return;
            }
            if (this.linking !== null || this.relinking !== null) {
                this.linkSnap = this.findSnap();
                this.scheduleDraw();
                return;
            }
            if (!this.permissions.inspect) return;
            let dirty = false;
            // port hover
            const hit = this.portAt(wx, wy);
            if ((hit?.port ?? null) !== (this.hoverPort?.port ?? null)) {
                if (this.hoverPort !== null)
                    this.emit('portHover', { node: this.hoverPort.node, port: this.hoverPort.port, hovering: false });
                this.hoverPort = hit;
                if (hit !== null) this.emit('portHover', { node: hit.node, port: hit.port, hovering: true });
                dirty = true;
            }
            // node hover (for tooltip)
            const nodeHit = hit === null ? this.nodeAt(wx, wy) : null;
            if (nodeHit !== this.hoverNode) {
                if (this.hoverNode !== null) this.emit('nodeHover', { node: this.hoverNode, hovering: false });
                this.hoverNode = nodeHit;
                if (nodeHit !== null) this.emit('nodeHover', { node: nodeHit, hovering: true });
                dirty = true;
            }
            // hover-delay before the tooltip appears
            const tipTgt: PortModel | NodeModel | null = this.hoverPort?.port ?? this.hoverNode;
            if (tipTgt !== this.tipTarget) {
                this.tipTarget = tipTgt;
                this.tipShow = false;
                if (this.tipTimer !== null) { clearTimeout(this.tipTimer); this.tipTimer = null; }
                if (tipTgt !== null) {
                    this.tipTimer = setTimeout(() => {
                        this.tipTimer = null;
                        this.tipShow = true;
                        this.scheduleDraw();
                    }, 400);
                }
                dirty = true;
            }
            // link hover (only when not over a port/node)
            const overNode = nodeHit !== null;
            const linkHit = hit === null && !overNode ? this.linkAt(wx, wy) : null;
            if (linkHit !== this.hoveredLink) {
                if (this.hoveredLink !== null) this.emit('linkHover', { link: this.hoveredLink, hovering: false });
                this.hoveredLink = linkHit;
                if (linkHit !== null) this.emit('linkHover', { link: linkHit, hovering: true });
                dirty = true;
            }
            const endpointHit = this.permissions.createLinks ? this.selectedLinkEndpointAt(wx, wy) : null;
            const directRelinkHit = this.permissions.createLinks && hit !== null
                ? this.directRelinkAtPort(hit.node, hit.port)
                : null;
            this.canvas.style.cursor = endpointHit !== null || directRelinkHit !== null ? 'grab'
                : hit !== null ? 'pointer'
                : overNode ? 'move'
                : linkHit !== null ? 'pointer' : 'default';
            if (dirty) this.scheduleDraw();
        });
        const finish = (e: MouseEvent | PointerEvent): void => {
            this.cancelLongPress();
            this.relinkCandidate = null;
            if (this.dragNode !== null) {
                // Capture before/after positions so the whole multi-node
                // drag is ONE undo step. Skip the action if nothing
                // actually moved (a "click" that bypassed the threshold).
                const moves = this.dragStart
                    .map((it) => ({ id: it.n.id, fromX: it.x, fromY: it.y, toX: it.n.x, toY: it.n.y }))
                    .filter((m) => m.fromX !== m.toX || m.fromY !== m.toY);
                for (const it of this.dragStart) this.emit('nodeMoved', { node: it.n });
                this.dragNode = null;
                this.dragStart = [];
                if (moves.length > 0) {
                    this.record({
                        do: () => { for (const m of moves) this.doMoveNode(m.id, m.toX, m.toY); },
                        undo: () => { for (const m of moves) this.doMoveNode(m.id, m.fromX, m.fromY); },
                        label: 'drag',
                    });
                }
            }
            if (this.rubber !== null) {
                const rx0 = Math.min(this.rubber.x0, this.rubber.x);
                const ry0 = Math.min(this.rubber.y0, this.rubber.y);
                const rx1 = Math.max(this.rubber.x0, this.rubber.x);
                const ry1 = Math.max(this.rubber.y0, this.rubber.y);
                this.rubber = null;
                if (rx1 - rx0 > 3 || ry1 - ry0 > 3) {
                    const inRect = this.nodes.filter((n) =>
                        n.x < rx1 && n.x + n.w > rx0 && n.y < ry1 && n.y + n.h > ry0);
                    const merge = e.shiftKey ? [...this.selectedNodes, ...inRect] : inRect;
                    this.setSelection([...new Set(merge)]);
                }
                this.scheduleDraw();
            }
            const viewportMoved = this.panning || this.ovDragging;
            this.panning = false;
            this.ovDragging = false;
            if (viewportMoved) this.emitViewChanged(false);
            if (this.linking !== null) {
                const [sx, sy] = localXY(e);
                const [wx, wy] = this.toWorld(sx, sy);
                // Commit to the magnetised socket if one is engaged;
                // otherwise fall back to whatever is exactly under the
                // cursor (covers a precise drop without a snap).
                const direct = this.portAt(wx, wy);
                const target = this.linkSnap
                    ?? (direct !== null && direct.port.direction === 'in' ? direct : null);
                if (target !== null) {
                    this.addLink({
                        from: this.linking.node.id, fromPort: this.linking.port.id,
                        to: target.node.id, toPort: target.port.id,
                    });
                }
                this.linking = null;
                this.linkSnap = null;
                this.scheduleDraw();
            }
            if (this.relinking !== null) {
                const gesture = this.relinking;
                const [sx, sy] = localXY(e);
                const [wx, wy] = this.toWorld(sx, sy);
                const direct = this.portAt(wx, wy);
                const expectedDirection: PortDirection = gesture.end === 'from' ? 'out' : 'in';
                const target = this.linkSnap
                    ?? (direct !== null && direct.port.direction === expectedDirection ? direct : null);
                if (target !== null) {
                    this.relink(gesture.link.id, {
                        from: gesture.end === 'from' ? target.node.id : gesture.link.from,
                        fromPort: gesture.end === 'from' ? target.port.id : gesture.link.fromPort,
                        to: gesture.end === 'to' ? target.node.id : gesture.link.to,
                        toPort: gesture.end === 'to' ? target.port.id : gesture.link.toPort,
                    });
                }
                this.relinking = null;
                this.linkSnap = null;
                this.scheduleDraw();
            }
        };
        this.listen(window, 'pointerup', finish);
        this.listen(window, 'pointercancel', finish);
        this.listen(this.canvas, 'wheel', (e) => {
            e.preventDefault();
            const [sx, sy] = localXY(e);
            const [wx, wy] = this.toWorld(sx, sy);
            // Smooth, device-consistent: zoom amount tracks wheel delta
            // magnitude instead of a fixed step (no more big jumps).
            const factor = Math.exp(-e.deltaY * 0.0015);
            this.scale = clamp(this.scale * factor, ZOOM_MIN, ZOOM_MAX);
            this.offX = sx - wx * this.scale;
            this.offY = sy - wy * this.scale;
            this.emitViewChanged(true);
            this.scheduleDraw();
        }, { passive: false });
        this.listen(this.canvas, 'pointerleave', () => {
            if (this.hoverPort !== null) this.emit('portHover', { node: this.hoverPort.node, port: this.hoverPort.port, hovering: false });
            if (this.hoverNode !== null) this.emit('nodeHover', { node: this.hoverNode, hovering: false });
            if (this.hoveredLink !== null) this.emit('linkHover', { link: this.hoveredLink, hovering: false });
            this.hoverPort = null; this.hoverNode = null; this.hoveredLink = null;
            this.tipTarget = null; this.tipShow = false;
            if (this.tipTimer !== null) { clearTimeout(this.tipTimer); this.tipTimer = null; }
            this.canvas.style.cursor = 'default';
            this.scheduleDraw();
        });
        this.listen(this.canvas, 'dblclick', (e) => {
            const [sx, sy] = localXY(e);
            const [wx, wy] = this.toWorld(sx, sy);
            if (this.portAt(wx, wy) !== null) return;
            const node = this.nodeAt(wx, wy);
            if (node !== null) {
                if (this.permissions.inspect && node.openAction.length > 0) {
                    e.preventDefault();
                    this.emit('nodeOpen', { node });
                }
                return;
            }
            this.zoomToFit();
        });
        // Desktop right-click → same contextMenu event as touch long-press.
        this.listen(this.canvas, 'contextmenu', (e) => {
            e.preventDefault();
            if (!this.permissions.inspect) return;
            const [sx, sy] = localXY(e);
            this.cancelLongPress();
            this.fireContextMenu(sx, sy, e.clientX, e.clientY);
        });
        // Two-finger pinch → uniform zoom around the initial midpoint
        // between the fingers. Mobile analog of mouse wheel.
        let pinchDist = 0;
        let pinchScale = 1;
        let pinchPivotW: [number, number] = [0, 0];
        let pinchPivotS: [number, number] = [0, 0];
        let pinching = false;
        this.listen(this.canvas, 'touchstart', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const r = this.canvas.getBoundingClientRect();
                const t0 = e.touches[0], t1 = e.touches[1];
                const x0 = t0.clientX - r.left, y0 = t0.clientY - r.top;
                const x1 = t1.clientX - r.left, y1 = t1.clientY - r.top;
                pinchDist = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
                pinchScale = this.scale;
                const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
                pinchPivotS = [mx, my];
                pinchPivotW = this.toWorld(mx, my);
                pinching = true;
                this.dragNode = null; this.dragStart = [];
                this.panning = false; this.rubber = null; this.linking = null;
                this.relinking = null; this.relinkCandidate = null;
            }
        }, { passive: false });
        this.listen(this.canvas, 'touchmove', (e) => {
            if (pinching && e.touches.length === 2) {
                e.preventDefault();
                const r = this.canvas.getBoundingClientRect();
                const t0 = e.touches[0], t1 = e.touches[1];
                const x0 = t0.clientX - r.left, y0 = t0.clientY - r.top;
                const x1 = t1.clientX - r.left, y1 = t1.clientY - r.top;
                const d = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
                const ns = clamp(pinchScale * (d / pinchDist), ZOOM_MIN, ZOOM_MAX);
                this.scale = ns;
                // Keep the pinch midpoint anchored at the world point it
                // started on (pivot stays put under the fingers).
                this.offX = pinchPivotS[0] - pinchPivotW[0] * ns;
                this.offY = pinchPivotS[1] - pinchPivotW[1] * ns;
                this.emitViewChanged(true);
                this.scheduleDraw();
            }
        }, { passive: false });
        const endPinch = (): void => { pinching = false; };
        this.listen(this.canvas, 'touchend', endPinch);
        this.listen(this.canvas, 'touchcancel', endPinch);
        this.listen(this.canvas, 'keydown', (e) => {
            if (this.permissions.moveNodes && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const step = (this.gridSnapEnabled ? this.gridSize : 1) * (e.shiftKey ? 5 : 1);
                const delta = e.key === 'ArrowLeft' ? [-step, 0]
                    : e.key === 'ArrowRight' ? [step, 0]
                    : e.key === 'ArrowUp' ? [0, -step]
                    : e.key === 'ArrowDown' ? [0, step]
                    : null;
                if (delta !== null && this.nudgeSelection(delta[0], delta[1])) {
                    e.preventDefault();
                    return;
                }
            }
            if (this.permissions.deleteSelection && (e.key === 'Delete' || e.key === 'Backspace')) {
                e.preventDefault(); this.deleteSelection(); return;
            }
            const mod = e.ctrlKey || e.metaKey;
            if (mod && this.permissions.copy && e.code === 'KeyC') { e.preventDefault(); this.copySelection(); return; }
            if (mod && this.permissions.paste && e.code === 'KeyV') { e.preventDefault(); this.pasteSelection(); return; }
            if (mod && this.permissions.copy && this.permissions.deleteSelection && e.code === 'KeyX') {
                e.preventDefault(); this.cutSelection(); return;
            }
            if (mod && this.permissions.select && e.code === 'KeyA') { e.preventDefault(); this.setSelection(this.nodes.slice()); return; }
            // Ctrl+Z = undo; Ctrl+Y or Ctrl+Shift+Z = redo.
            if (mod && this.permissions.history && e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); this.undo(); return; }
            if (mod && this.permissions.history && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) {
                e.preventDefault(); this.redo(); return;
            }
        });
    }

    // ---- drawing ----------------------------------------------------
    private scheduleDraw(): void {
        if (this.destroyed || this.drawScheduled) return;
        this.drawScheduled = true;
        requestAnimationFrame(() => {
            this.drawScheduled = false;
            if (!this.destroyed) this.draw();
        });
    }
    private draw(options: DiagramRenderOptions = SCREEN_RENDER_OPTIONS): void {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);
        ctx.fillStyle = this.opts.background ?? '#1b1b1f';
        ctx.fillRect(0, 0, this.width, this.height);
        // Entrance animation — scheme rises from below + fades in over
        // the opaque background.
        let introDy = 0;
        let introAlpha = 1;
        if (options.transient && this.introStart !== null) {
            const e = Math.min(1, (performance.now() - this.introStart) / INTRO_MS);
            const k = 1 - Math.pow(1 - e, 3);   // easeOutCubic
            introAlpha = k;
            introDy = (1 - k) * INTRO_RISE;
            if (e >= 1) this.introStart = null;
        }
        ctx.save();
        ctx.globalAlpha = introAlpha;
        if (options.grid) this.drawGrid();
        ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale,
            this.dpr * this.offX, this.dpr * (this.offY + introDy));
        // Links first. Each link jumps over the verticals of the links
        // drawn before it (deterministic bridge — Link.JumpOver parity).
        const prior: Seg[] = [];   // segments of links already drawn
        const hoveredNode = this.hoverPort?.node ?? this.hoverNode;
        for (const l of this.links) {
            const a = this.endpoint(l, 'from');
            const b = this.endpoint(l, 'to');
            if (a === null || b === null) continue;
            const fp = this.nodes.find((n) => n.id === l.from)?.outPorts.find((p) => p.id === l.fromPort);
            const baseColor = fp ? this.portColor(fp.type) : '#7d828a';
            const state = options.selection && l === this.selectedLink
                ? 'sel'
                : options.transient && (l === this.hoveredLink
                    || (hoveredNode !== null && (l.from === hoveredNode.id || l.to === hoveredNode.id)))
                    ? 'hov'
                    : 'norm';
            const color = state === 'sel' ? '#4aa3ff' : state === 'hov' ? '#cfe3ff' : baseColor;
            const width = state === 'sel' ? 3 : state === 'hov' ? 2.6 : 2;
            const pts = this.routeLink(a, b, new Set([l.from, l.to]));
            this.strokeRoute(pts, color, width, prior);
            this.drawArrow(pts, color);
            for (let k = 1; k < pts.length; k += 1) {
                const [x1, y1] = pts[k - 1];
                const [x2, y2] = pts[k];
                if (x1 === x2 && y1 !== y2) prior.push({ h: false, c: x1, a: Math.min(y1, y2), b: Math.max(y1, y2) });
                else if (y1 === y2 && x1 !== x2) prior.push({ h: true, c: y1, a: Math.min(x1, x2), b: Math.max(x1, x2) });
            }
        }
        if (options.transient && (this.linking !== null || this.relinking !== null)) this.drawPendingLink();
        for (const n of this.nodes) this.drawNode(n, options.selection && this.selectedNodes.has(n), options);
        if (options.selection && this.permissions.createLinks && this.relinking === null)
            this.drawSelectedLinkEndpoints();
        if (options.transient && this.rubber !== null) {
            const rx = Math.min(this.rubber.x0, this.rubber.x);
            const ry = Math.min(this.rubber.y0, this.rubber.y);
            const rw = Math.abs(this.rubber.x - this.rubber.x0);
            const rh = Math.abs(this.rubber.y - this.rubber.y0);
            ctx.fillStyle = 'rgba(74,163,255,0.12)';
            ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeStyle = '#4aa3ff';
            ctx.lineWidth = 1 / this.scale;
            ctx.strokeRect(rx, ry, rw, rh);
        }
        ctx.restore();
        if (options.overview) this.drawOverview();
        if (options.runtime) this.drawGlobalError();
        if (options.transient) this.drawTooltip();
        if (options.transient && (this.introStart !== null || this.globalErrorFlashStart !== null
            || this.nodes.some((n) => n.errorFlashStart !== null)))
            this.scheduleDraw();   // keep entrance / error feedback animating
    }
    private drawGlobalError(): void {
        const error = this.runtimeState.globalError;
        if (error === null) return;
        const ctx = this.ctx;
        let flashAlpha = 1;
        if (this.globalErrorFlashStart !== null) {
            const elapsed = performance.now() - this.globalErrorFlashStart;
            if (elapsed >= ERROR_FLASH_MS) {
                this.globalErrorFlashStart = null;
            } else {
                flashAlpha = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(
                    elapsed / ERROR_FLASH_MS * Math.PI * 6 - Math.PI / 2));
            }
        }
        const neutral = error.kind === 'locked' || error.kind === 'encrypted';
        ctx.save();
        ctx.globalAlpha = flashAlpha;
        ctx.fillStyle = neutral ? 'rgba(18,20,26,0.82)' : 'rgba(55,16,22,0.78)';
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.font = '600 15px Segoe UI, Tahoma, sans-serif';
        const lines = this.wrapTooltip(error.message, Math.max(120, Math.min(520, this.width - 80)));
        const lineHeight = 21;
        const boxWidth = Math.min(this.width - 32,
            Math.max(180, ...lines.map((line) => ctx.measureText(line).width + 36)));
        const boxHeight = lines.length * lineHeight + 32;
        const x = (this.width - boxWidth) / 2;
        const y = (this.height - boxHeight) / 2;
        roundRect(ctx, x, y, boxWidth, boxHeight, 8);
        ctx.fillStyle = neutral ? 'rgba(36,39,48,0.98)' : 'rgba(75,22,31,0.98)';
        ctx.fill();
        ctx.strokeStyle = neutral ? '#858b98' : ERROR_RED;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        lines.forEach((line, index) => {
            ctx.fillText(line, this.width / 2, y + 16 + lineHeight * index + lineHeight / 2);
        });
        ctx.restore();
    }
    private drawTooltip(): void {
        if (!this.tipShow) return;   // wait out the hover delay
        if (this.dragNode !== null || this.linking !== null || this.relinking !== null || this.panning || this.ovDragging) return;
        let text = '';
        let isError = false;
        if (this.hoverPort !== null) {
            const p = this.hoverPort.port;
            text = p.type ? `${p.name}  ·  ${p.type}` : p.name;
            const runtime = this.portRuntimeState(this.hoverPort.node, p);
            if (runtime?.value !== null && runtime?.value !== undefined) text += `\nValue: ${runtime.value}`;
            if (runtime?.error !== null && runtime?.error !== undefined) {
                text += `\n${runtime.error}`;
                isError = true;
            }
        } else if (this.hoverNode !== null) {
            const n = this.hoverNode;
            const errors = [n.runtimeError, n.loadError].filter((value) => value.length > 0);
            if (errors.length > 0) {
                text = errors.join('\n');
                isError = true;
            } else if (this.showNodeMessages && n.message.length > 0) {
                text = n.message;
            } else if (n.description.length > 0) {
                text = n.description;
            } else {
                text = n.typeId && n.typeId !== n.name ? `${n.name}   [${n.typeId}]` : n.name;
            }
        } else {
            return;
        }
        const ctx = this.ctx;
        ctx.font = '11px Segoe UI, Tahoma, sans-serif';
        const padX = 9;
        const padY = 6;
        const lineH = 15;
        const lines = this.wrapTooltip(text, 340);
        const h = lines.length * lineH + padY * 2;
        const w = Math.max(...lines.map((line) => ctx.measureText(line).width)) + padX * 2;
        let x = this.cursor.x + 14;
        let y = this.cursor.y + 18;
        if (x + w > this.width) x = this.width - w - 4;
        if (y + h > this.height) y = this.cursor.y - h - 10;
        roundRect(ctx, x, y, w, h, 4);
        ctx.fillStyle = isError ? 'rgba(55,16,22,0.97)' : 'rgba(18,20,26,0.96)';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = isError ? ERROR_RED : '#3a3a46';
        ctx.stroke();
        ctx.fillStyle = '#e8e8ee';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        lines.forEach((line, index) => {
            ctx.fillText(line, x + padX, y + padY + lineH * index + lineH / 2);
        });
    }
    private wrapTooltip(text: string, maxWidth: number): string[] {
        const lines: string[] = [];
        for (const paragraph of text.split(/\r?\n/)) {
            const words = paragraph.split(/\s+/).filter(Boolean);
            if (words.length === 0) { lines.push(''); continue; }
            let line = words[0];
            for (let i = 1; i < words.length; i += 1) {
                const next = `${line} ${words[i]}`;
                if (this.ctx.measureText(next).width <= maxWidth) line = next;
                else { lines.push(line); line = words[i]; }
            }
            lines.push(line);
        }
        return lines.length > 0 ? lines : [''];
    }
    private drawGrid(): void {
        const ctx = this.ctx;
        const step = this.gridSize * this.scale;
        if (step < 6) return;
        ctx.strokeStyle = this.opts.gridColor ?? '#26262c';
        ctx.lineWidth = 1;
        const ox = this.offX % step;
        const oy = this.offY % step;
        ctx.beginPath();
        for (let x = ox; x < this.width; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, this.height); }
        for (let y = oy; y < this.height; y += step) { ctx.moveTo(0, y + 0.5); ctx.lineTo(this.width, y + 0.5); }
        ctx.stroke();
    }
    // Lazily load + cache a node-icon image by URL; repaints once it decodes.
    private getIcon(url: string): HTMLImageElement | null {
        const cached = this.iconCache.get(url);
        if (cached !== undefined) return cached;     // img = ready; null = loading/failed
        this.iconCache.set(url, null);               // mark in-flight to avoid duplicate loads
        const img = new Image();
        img.onload = () => { this.iconCache.set(url, img); this.scheduleDraw(); };
        img.onerror = () => { this.iconCache.set(url, null); };
        img.src = url;
        return null;
    }
    private drawNode(n: NodeModel, selected: boolean, options: DiagramRenderOptions): void {
        const ctx = this.ctx;
        const hasLoadError = options.runtime && n.loadError.length > 0;
        const hasRuntimeError = options.runtime && n.runtimeError.length > 0;
        const runtime = options.runtime ? this.runtimeState.nodes[n.id] : undefined;
        const active = options.runtime
            && (this.runtimeState.activeNodeId === n.id || runtime?.active === true);
        roundRect(ctx, n.x, n.y, n.w, n.h, 6);
        ctx.fillStyle = hasLoadError ? ERROR_BACKGROUND : active ? '#ffd1dc' : n.color;
        ctx.fill();
        ctx.lineWidth = selected ? 2 : 1.5;
        ctx.strokeStyle = selected ? '#4aa3ff' : n.border;
        ctx.stroke();
        if (hasLoadError || hasRuntimeError) {
            let alpha = 1;
            if (options.transient && hasRuntimeError && n.errorFlashStart !== null) {
                const elapsed = performance.now() - n.errorFlashStart;
                if (elapsed >= ERROR_FLASH_MS) {
                    n.errorFlashStart = null;
                } else {
                    // Three clear pulses before the border settles on red.
                    alpha = 0.12 + 0.88 * (0.5 + 0.5 * Math.sin(
                        elapsed / ERROR_FLASH_MS * Math.PI * 6 - Math.PI / 2));
                }
            }
            ctx.save();
            ctx.globalAlpha *= alpha;
            roundRect(ctx, n.x, n.y, n.w, n.h, 6);
            ctx.lineWidth = hasRuntimeError ? 3 : 2;
            ctx.strokeStyle = ERROR_RED;
            ctx.stroke();
            ctx.restore();
        }
        // Element icon on the left, vertically centred (lazy-loaded, cached).
        const iconW = 18;
        if (n.icon) {
            const img = this.getIcon(n.icon);
            if (img) { try { ctx.drawImage(img, n.x + 8, n.y + (n.h - iconW) / 2, iconW, iconW); } catch { /* undecodable */ } }
        }
        // Bold title centred on the light body (nudged right when an icon shows so
        // they don't overlap); ports are bare colour squares on the edges.
        const titleShift = n.icon ? iconW + 4 : 0;
        ctx.fillStyle = hasLoadError ? '#ffffff' : '#1b1b1b';
        ctx.font = '600 12px Segoe UI, Tahoma, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.name, n.x + titleShift + (n.w - titleShift) / 2, n.y + n.h / 2, n.w - titleShift - 14);
        for (const p of n.inPorts) this.drawPort(n, p, options);
        for (const p of n.outPorts) this.drawPort(n, p, options);
    }
    private drawPort(node: NodeModel, p: PortModel, options: DiagramRenderOptions): void {
        const ctx = this.ctx;
        const hovered = options.transient && this.hoverPort?.port === p;
        const magnet = options.transient && this.linkSnap?.port === p;
        const runtime = options.runtime ? this.portRuntimeState(node, p) : null;
        const s = magnet ? PORT_SQ + 4 : hovered ? PORT_SQ + 2 : PORT_SQ;
        const x = p.cx - s / 2;
        const y = p.cy - s / 2;
        const r = Math.min(2.5, s / 4);
        if (magnet) {
            roundRect(ctx, x - 4, y - 4, s + 8, s + 8, r + 2);
            ctx.fillStyle = 'rgba(255,255,255,0.16)';
            ctx.fill();
        }
        // Single rounded path filled + stroked (aligned, anti-aliased —
        // no half-pixel double edge).
        roundRect(ctx, x, y, s, s, r);
        ctx.fillStyle = this.portColor(p.type);
        ctx.fill();
        ctx.lineWidth = magnet ? 1.5 : 1;
        ctx.strokeStyle = magnet ? '#ffffff' : 'rgba(12,12,16,0.55)';
        ctx.stroke();
        const runtimeSelected = runtime?.selected === true || (options.selection && this.selectedPort?.port === p);
        const breakpoint = runtime?.breakpoint === true;
        const breakpointActive = runtime?.breakpointActive === true;
        const runtimeActive = runtime?.active === true;
        const hasError = runtime?.error !== null && runtime?.error !== undefined;
        if (runtimeSelected || breakpoint || breakpointActive || runtimeActive || hasError) {
            ctx.beginPath();
            ctx.arc(p.cx, p.cy, s / 2 + 4, 0, Math.PI * 2);
            if (breakpointActive) {
                ctx.fillStyle = '#8b0000';
                ctx.fill();
            } else if (runtimeSelected) {
                ctx.fillStyle = 'rgba(211,211,211,0.56)';
                ctx.fill();
            }
            ctx.lineWidth = 2;
            ctx.strokeStyle = hasError || breakpointActive ? ERROR_RED
                : breakpoint ? '#ffb6c1'
                    : runtimeActive ? '#ffffff'
                        : '#d3d3d3';
            ctx.stroke();
        }
    }
    private portRuntimeState(node: NodeModel, port: PortModel): DiagramPortRuntimeState | null {
        return this.runtimeState.nodes[node.id]?.ports[port.direction][port.id] ?? null;
    }
    // Symmetric jump-over: any segment of THIS link hops the perpendicular
    // segments of links drawn before it (H over earlier V, V over earlier
    // H). Exactly one bridge per real crossing, consistent everywhere.
    private strokeRoute(pts: number[][], color: string, width: number, prior: Seg[]): void {
        const ctx = this.ctx;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineJoin = 'miter';
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        const H = LINK_HOP;
        for (let i = 1; i < pts.length; i += 1) {
            const [x1, y1] = pts[i - 1];
            const [x2, y2] = pts[i];
            if (y1 === y2 && x1 !== x2) {
                const dir = x2 > x1 ? 1 : -1;
                const cuts = prior
                    .filter((s) => !s.h && s.a < y1 - 0.5 && y1 + 0.5 < s.b &&
                        Math.min(x1, x2) + H < s.c && s.c < Math.max(x1, x2) - H)
                    .map((s) => s.c)
                    .sort((p, q) => dir * (p - q));
                for (const cx of cuts) {
                    ctx.lineTo(cx - dir * H, y1);
                    if (dir > 0) ctx.arc(cx, y1, H, Math.PI, 2 * Math.PI, false);
                    else ctx.arc(cx, y1, H, 0, Math.PI, true);
                }
                ctx.lineTo(x2, y2);
            } else if (x1 === x2 && y1 !== y2) {
                const dir = y2 > y1 ? 1 : -1;
                const cuts = prior
                    .filter((s) => s.h && s.a < x1 - 0.5 && x1 + 0.5 < s.b &&
                        Math.min(y1, y2) + H < s.c && s.c < Math.max(y1, y2) - H)
                    .map((s) => s.c)
                    .sort((p, q) => dir * (p - q));
                for (const cy of cuts) {
                    ctx.lineTo(x1, cy - dir * H);
                    if (dir > 0) ctx.arc(x1, cy, H, -Math.PI / 2, Math.PI / 2, false);
                    else ctx.arc(x1, cy, H, Math.PI / 2, -Math.PI / 2, true);
                }
                ctx.lineTo(x2, y2);
            } else {
                ctx.lineTo(x2, y2);
            }
        }
        ctx.stroke();
    }
    private drawArrow(pts: number[][], color: string): void {
        const n = pts.length;
        const [px, py] = pts[n - 2];
        const [ex, ey] = pts[n - 1];
        const ang = Math.atan2(ey - py, ex - px);
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(ex, ey);
        ctx.rotate(ang);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(-9, -4.5); ctx.lineTo(-9, 4.5); ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    private drawSelectedLinkEndpoints(): void {
        if (this.selectedLink === null) return;
        const ctx = this.ctx;
        const halfSize = RELINK_HANDLE_PX / 2 / this.scale;
        for (const end of ['from', 'to'] as const) {
            const point = this.endpoint(this.selectedLink, end);
            if (point === null) continue;
            ctx.beginPath();
            ctx.moveTo(point[0], point[1] - halfSize);
            ctx.lineTo(point[0] + halfSize, point[1]);
            ctx.lineTo(point[0], point[1] + halfSize);
            ctx.lineTo(point[0] - halfSize, point[1]);
            ctx.closePath();
            ctx.fillStyle = '#00ffff';
            ctx.fill();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 1 / this.scale;
            ctx.stroke();
        }
    }
    private drawPendingLink(): void {
        if (this.linking === null && this.relinking === null) return;
        const ctx = this.ctx;
        const snapped = this.linkSnap;
        const cursor = this.toWorld(this.cursor.x, this.cursor.y) as [number, number];
        let a: [number, number];
        let b: [number, number];
        let colorType = '';
        let snapPoint: [number, number] | null = null;
        const excludedNodes = new Set<string>();

        if (this.linking !== null) {
            a = [this.linking.port.cx, this.linking.port.cy];
            b = snapped === null ? cursor : [snapped.port.cx, snapped.port.cy];
            colorType = this.linking.port.type;
            excludedNodes.add(this.linking.node.id);
            if (snapped !== null) snapPoint = b;
        } else {
            const gesture = this.relinking!;
            const fixed = this.endpoint(gesture.link, gesture.end === 'from' ? 'to' : 'from');
            if (fixed === null) return;
            const sourcePort = this.nodes.find((node) => node.id === gesture.link.from)?.outPorts
                .find((port) => port.id === gesture.link.fromPort);
            if (gesture.end === 'from') {
                a = snapped === null ? cursor : [snapped.port.cx, snapped.port.cy];
                b = fixed;
                colorType = snapped?.port.type ?? sourcePort?.type ?? '';
                excludedNodes.add(gesture.link.to);
                if (snapped !== null) snapPoint = a;
            } else {
                a = fixed;
                b = snapped === null ? cursor : [snapped.port.cx, snapped.port.cy];
                colorType = sourcePort?.type ?? '';
                excludedNodes.add(gesture.link.from);
                if (snapped !== null) snapPoint = b;
            }
        }
        if (snapped !== null) excludedNodes.add(snapped.node.id);
        const points = this.routeLink(a, b, excludedNodes);
        ctx.strokeStyle = this.portColor(colorType);
        if (snapped !== null) { ctx.setLineDash([]); ctx.lineWidth = 2.6; }
        else { ctx.setLineDash([5, 4]); ctx.lineWidth = 2; }
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let index = 1; index < points.length; index += 1) ctx.lineTo(points[index][0], points[index][1]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (snapPoint !== null) {
            ctx.beginPath();
            ctx.arc(snapPoint[0], snapPoint[1], PORT_R + 4, 0, Math.PI * 2);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    // ---- overview minimap (go.Overview parity) ----------------------
    private overviewRect(): { x: number; y: number; w: number; h: number } | null {
        if (!this.overviewVisible || this.width < 320 || this.height < 220) return null;
        const w = 190, h = 130, m = 14;
        return { x: this.width - w - m, y: this.height - h - m, w, h };
    }
    private drawOverview(): void {
        const r = this.overviewRect();
        const gb = this.graphBounds();
        if (r === null || gb === null) { this.ovGeo = null; return; }
        const ctx = this.ctx;
        const pad = 8;
        const gw = (gb.maxX - gb.minX) || 1;
        const gh = (gb.maxY - gb.minY) || 1;
        const s = Math.min((r.w - pad * 2) / gw, (r.h - pad * 2) / gh);
        const ox = r.x + pad + ((r.w - pad * 2) - gw * s) / 2;
        const oy = r.y + pad + ((r.h - pad * 2) - gh * s) / 2;
        this.ovGeo = { x: ox, y: oy, w: r.w, h: r.h, s, minX: gb.minX, minY: gb.minY };
        const mx = (wx: number): number => ox + (wx - gb.minX) * s;
        const my = (wy: number): number => oy + (wy - gb.minY) * s;
        const light = colorLuminance(this.opts.background) >= 150;
        const overviewBackground = this.opts.overviewBackground
            ?? (light ? 'rgba(255,255,255,0.94)' : 'rgba(16,16,20,0.88)');
        const overviewBorder = this.opts.overviewBorderColor
            ?? (light ? '#cbd5e1' : '#3a3a44');
        const viewportColor = this.opts.overviewViewportColor
            ?? (light ? '#d97706' : '#4aa3ff');
        const viewportFill = this.opts.overviewViewportFill
            ?? (light ? 'rgba(217,119,6,0.10)' : 'rgba(74,163,255,0.10)');

        ctx.save();
        roundRect(ctx, r.x, r.y, r.w, r.h, 6);
        ctx.fillStyle = overviewBackground;
        ctx.fill();
        ctx.strokeStyle = overviewBorder;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.clip();
        for (const n of this.nodes) {
            ctx.fillStyle = n.color;
            ctx.fillRect(mx(n.x), my(n.y), Math.max(2, n.w * s), Math.max(2, n.h * s));
            ctx.strokeStyle = n.border;
            ctx.lineWidth = 1;
            ctx.strokeRect(mx(n.x), my(n.y), Math.max(2, n.w * s), Math.max(2, n.h * s));
        }
        // viewport rectangle (what the main canvas currently shows)
        const [vx0, vy0] = this.toWorld(0, 0);
        const [vx1, vy1] = this.toWorld(this.width, this.height);
        ctx.strokeStyle = viewportColor;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(mx(vx0), my(vy0), (vx1 - vx0) * s, (vy1 - vy0) * s);
        ctx.fillStyle = viewportFill;
        ctx.fillRect(mx(vx0), my(vy0), (vx1 - vx0) * s, (vy1 - vy0) * s);
        ctx.restore();
    }
    private ovHit(sx: number, sy: number): boolean {
        const r = this.overviewRect();
        return r !== null && sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h;
    }
    private ovPanTo(sx: number, sy: number): void {
        if (this.ovGeo === null) return;
        const g = this.ovGeo;
        const wx = g.minX + (sx - g.x) / g.s;
        const wy = g.minY + (sy - g.y) / g.s;
        this.offX = this.width / 2 - wx * this.scale;
        this.offY = this.height / 2 - wy * this.scale;
        this.scheduleDraw();
    }

    private emitViewChanged(zoomChanged: boolean): void {
        if (zoomChanged) this.emit('zoomChanged', { scale: this.scale });
        this.emit('viewChanged', this.getViewState());
    }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}
// Orthogonal route out-port → in-port. Forward (target to the right):
// a 3-segment mid-X elbow. Backward/too-close: a 5-segment detour that
// leaves the source rightward and re-enters the target from the left
// (AvoidsNodes-style, never a diagonal).
function route(a: [number, number], b: [number, number]): number[][] {
    const [ax, ay] = a;
    const [bx, by] = b;
    if (bx - ax >= LINK_STUB * 2) {
        const mx = (ax + bx) / 2;
        return [[ax, ay], [mx, ay], [mx, by], [bx, by]];
    }
    const midY = (ay + by) / 2;
    return [[ax, ay], [ax + LINK_STUB, ay], [ax + LINK_STUB, midY],
            [bx - LINK_STUB, midY], [bx - LINK_STUB, by], [bx, by]];
}

// --- AvoidsNodes routing ------------------------------------------------
// Obstacle rects are [x,y,w,h] (already inflated by the caller). Fast
// path: the plain elbow when it doesn't touch any box (only bend when
// you must). Otherwise an orthogonal A* around the boxes — so a node
// dropped on a link makes it re-route ("push apart") instead of passing
// underneath.
const ROUTE_CELL = 14;
const A_STEP = 10;
const A_TURN = 40;          // heavy turn cost → A* strongly prefers straight runs

type Rect = [number, number, number, number];
// A drawn link segment for jump-over: h = horizontal (line y=c, x∈[a,b]),
// else vertical (line x=c, y∈[a,b]).
type Seg = { h: boolean; c: number; a: number; b: number };

function segHitsRect(x1: number, y1: number, x2: number, y2: number, r: Rect): boolean {
    const rx2 = r[0] + r[2];
    const ry2 = r[1] + r[3];
    if (y1 === y2) {
        if (y1 <= r[1] || y1 >= ry2) return false;
        return Math.min(x1, x2) < rx2 && Math.max(x1, x2) > r[0];
    }
    if (x1 === x2) {
        if (x1 <= r[0] || x1 >= rx2) return false;
        return Math.min(y1, y2) < ry2 && Math.max(y1, y2) > r[1];
    }
    return false;
}
function polyHitsRects(pts: number[][], rects: Rect[]): boolean {
    for (let i = 1; i < pts.length; i += 1)
        for (const r of rects)
            if (segHitsRect(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], r)) return true;
    return false;
}
function orthogonalize(ps: number[][]): number[][] {
    const o: number[][] = [ps[0]];
    for (let i = 1; i < ps.length; i += 1) {
        const pr = o[o.length - 1];
        const p = ps[i];
        if (pr[0] !== p[0] && pr[1] !== p[1]) o.push([p[0], pr[1]]);
        o.push(p);
    }
    return o;
}
function collapse(ps: number[][]): number[][] {
    const o: number[][] = [];
    for (const p of ps) {
        if (o.length > 0) {
            const last = o[o.length - 1];
            if (last[0] === p[0] && last[1] === p[1]) continue;
        }
        if (o.length >= 2) {
            const a = o[o.length - 2];
            const b = o[o.length - 1];
            if ((a[0] === b[0] && b[0] === p[0]) || (a[1] === b[1] && b[1] === p[1])) {
                o[o.length - 1] = p;
                continue;
            }
        }
        o.push(p);
    }
    return o;
}
function hitsAny(x1: number, y1: number, x2: number, y2: number, rects: Rect[]): boolean {
    for (const r of rects) if (segHitsRect(x1, y1, x2, y2, r)) return true;
    return false;
}
// Staircase → L: repeatedly try to replace two consecutive bends with a
// single corner when the shortcut stays orthogonal and clear of boxes.
// Cuts the A* zig-zag down to the minimum number of bends.
function simplifyOrtho(pts: number[][], rects: Rect[]): number[][] {
    let p = pts.slice();
    let changed = true;
    let guard = 0;
    while (changed && guard < 40) {
        changed = false;
        guard += 1;
        // Keep the first/last two points (port → stub) untouched so the
        // entry/exit stays a clean horizontal run into the socket.
        for (let i = 2; i + 3 < p.length; i += 1) {
            const A = p[i - 1];
            const D = p[i + 2];
            for (const E of [[D[0], A[1]], [A[0], D[1]]] as number[][]) {
                if ((E[0] === A[0] && E[1] === A[1]) || (E[0] === D[0] && E[1] === D[1])) continue;
                if (hitsAny(A[0], A[1], E[0], E[1], rects)) continue;
                if (hitsAny(E[0], E[1], D[0], D[1], rects)) continue;
                p = p.slice(0, i).concat([E], p.slice(i + 2));
                changed = true;
                break;
            }
            if (changed) break;
        }
    }
    return p;
}
function aStarGrid(start: [number, number], goal: [number, number], rects: Rect[]): number[][] | null {
    let minX = Math.min(start[0], goal[0]);
    let minY = Math.min(start[1], goal[1]);
    let maxX = Math.max(start[0], goal[0]);
    let maxY = Math.max(start[1], goal[1]);
    for (const r of rects) {
        minX = Math.min(minX, r[0]); minY = Math.min(minY, r[1]);
        maxX = Math.max(maxX, r[0] + r[2]); maxY = Math.max(maxY, r[1] + r[3]);
    }
    const pad = LINK_STUB + ROUTE_CELL * 2;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    let cell = ROUTE_CELL;
    let cols = Math.ceil((maxX - minX) / cell);
    let rows = Math.ceil((maxY - minY) / cell);
    const CAP = 260;
    if (cols > CAP || rows > CAP) {
        cell = Math.max((maxX - minX) / CAP, (maxY - minY) / CAP);
        cols = Math.ceil((maxX - minX) / cell);
        rows = Math.ceil((maxY - minY) / cell);
    }
    const n = cols * rows;
    if (n <= 0 || n > 80000) return null;
    const cx = (c: number): number => minX + (c + 0.5) * cell;
    const cy = (r: number): number => minY + (r + 0.5) * cell;
    const blocked = new Uint8Array(n);
    for (const r of rects) {
        const c0 = Math.max(0, Math.floor((r[0] - minX) / cell));
        const c1 = Math.min(cols - 1, Math.floor((r[0] + r[2] - minX) / cell));
        const r0 = Math.max(0, Math.floor((r[1] - minY) / cell));
        const r1 = Math.min(rows - 1, Math.floor((r[1] + r[3] - minY) / cell));
        for (let rr = r0; rr <= r1; rr += 1)
            for (let cc = c0; cc <= c1; cc += 1) blocked[rr * cols + cc] = 1;
    }
    const sc = clamp(Math.floor((start[0] - minX) / cell), 0, cols - 1);
    const sr = clamp(Math.floor((start[1] - minY) / cell), 0, rows - 1);
    const gc = clamp(Math.floor((goal[0] - minX) / cell), 0, cols - 1);
    const gr = clamp(Math.floor((goal[1] - minY) / cell), 0, rows - 1);
    const si = sr * cols + sc;
    const gi = gr * cols + gc;
    blocked[si] = 0;
    blocked[gi] = 0;

    const g = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const dir = new Int8Array(n).fill(-1);   // 0=h,1=v incoming move
    g[si] = 0;
    // binary heap of indices keyed by f
    const heap: number[] = [si];
    const f = new Float64Array(n);
    f[si] = (Math.abs(gc - sc) + Math.abs(gr - sr)) * A_STEP;
    const swap = (i: number, j: number): void => { const t = heap[i]; heap[i] = heap[j]; heap[j] = t; };
    const push = (v: number): void => {
        heap.push(v);
        let i = heap.length - 1;
        while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p]] <= f[heap[i]]) break; swap(i, p); i = p; }
    };
    const pop = (): number => {
        const top = heap[0];
        const last = heap.pop() as number;
        if (heap.length > 0) {
            heap[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1;
                const r = 2 * i + 2;
                let s = i;
                if (l < heap.length && f[heap[l]] < f[heap[s]]) s = l;
                if (r < heap.length && f[heap[r]] < f[heap[s]]) s = r;
                if (s === i) break;
                swap(i, s); i = s;
            }
        }
        return top;
    };
    const seen = new Uint8Array(n);
    while (heap.length > 0) {
        const cur = pop();
        if (cur === gi) break;
        if (seen[cur]) continue;
        seen[cur] = 1;
        const ccol = cur % cols;
        const crow = (cur - ccol) / cols;
        const steps: Array<[number, number, number]> = [
            [1, 0, 0], [-1, 0, 0], [0, 1, 1], [0, -1, 1],
        ];
        for (const [dc, dr, md] of steps) {
            const nc = ccol + dc;
            const nr = crow + dr;
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            const ni = nr * cols + nc;
            if (blocked[ni]) continue;
            const turn = dir[cur] !== -1 && dir[cur] !== md ? A_TURN : 0;
            const ng = g[cur] + A_STEP + turn;
            if (ng < g[ni]) {
                g[ni] = ng;
                prev[ni] = cur;
                dir[ni] = md as number;
                f[ni] = ng + (Math.abs(gc - nc) + Math.abs(gr - nr)) * A_STEP;
                push(ni);
            }
        }
    }
    if (prev[gi] === -1 && gi !== si) return null;
    const out: number[][] = [];
    let p = gi;
    while (p !== -1) { out.push([cx(p % cols), cy((p - (p % cols)) / cols)]); p = prev[p]; }
    out.reverse();
    return out;
}
function routeAvoid(a: [number, number], b: [number, number], rects: Rect[]): number[][] {
    const simple = route(a, b);
    if (rects.length === 0 || !polyHitsRects(simple, rects)) return simple;
    const A2: [number, number] = [a[0] + LINK_STUB, a[1]];
    const B2: [number, number] = [b[0] - LINK_STUB, b[1]];
    const grid = aStarGrid(A2, B2, rects);
    if (grid === null) return simple;
    // Keep the approach monotonic: clamp interior X into the corridor
    // between the two stubs so the path can't overshoot past the port
    // and double back (the ⊓ "hook" at the socket). The vertical
    // alignment then lands cleanly at the stub X, STUB away from the
    // port — a straight horizontal entry.
    const lo = Math.min(A2[0], B2[0]);
    const hi = Math.max(A2[0], B2[0]);
    const clipped = grid.map((p) => [clamp(p[0], lo, hi), p[1]] as number[]);
    const poly = collapse(orthogonalize([a, A2, ...clipped, B2, b]));
    return collapse(simplifyOrtho(poly, rects));
}
function ptSegDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
    t = clamp(t, 0, 1);
    const cx = x1 + t * dx;
    const cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
}

export const version = '0.1.0';
