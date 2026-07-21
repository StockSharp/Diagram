import { StockSharpCatalog } from './catalog.js';
import { EventEmitter } from './event-emitter.js';
import { t } from '../i18n.js';
import goRuntime from '../ssdiagram.js';
import {
    DiagramNode,
    Link,
    LinkData,
    Node,
    NodeData,
    Port,
    PortData,
    PortDirection,
} from './types.js';

// Use an explicit module dependency for the runtime value. The ambient
// namespace in ssdiagram.d.ts continues to provide the legacy type surface,
// while this binding makes ESM/Node bundles independent of an implicit
// browser-global identifier.
const go = goRuntime as unknown as typeof window.go;

export interface DiagramOptions {
    div: HTMLElement;
    catalog: StockSharpCatalog;
    overviewDiv?: HTMLElement | null;
    overviewContainer?: HTMLElement | null;
    zoomLabel?: HTMLElement | null;
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

export interface ContextCommandPayload {
    command: ContextCommand;
    nodes: DiagramNode[];
    links: Link[];
}

export type ContextCommand = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'open' | 'delete' | 'properties' | 'help';

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
    nodeMoved: NodeMovedPayload;
    nodeSelected: NodeSelectedPayload;
    nodeHover: NodeHoverPayload;
    portSelected: PortSelectedPayload;
    portHover: PortHoverPayload;
    linkSelected: LinkSelectedPayload;
    linkHover: LinkHoverPayload;
    linkValidation: LinkValidationPayload;
    loadFinished: LoadFinishedPayload;
    contextCommand: ContextCommandPayload;
    undoRequested: NodeChangePayload & LinkChangePayload;
    redoRequested: NodeChangePayload & LinkChangePayload;
    nodeEdit: NodeChangePayload;
    nodeProperties: NodeChangePayload;
    nodeOpen: NodeChangePayload;
    nodeHelp: NodeChangePayload;
}

interface PendingChanges {
    nodesAdded: NodeData[];
    nodesRemoved: NodeData[];
    linksAdded: LinkData[];
    linksRemoved: LinkData[];
}

export class StockSharpDiagram extends EventEmitter<DiagramEvents> {
    private readonly div: HTMLElement;
    private readonly catalog: StockSharpCatalog;
    private readonly overviewDiv: HTMLElement | null;
    private readonly overviewContainer: HTMLElement | null;
    private readonly zoomLabel: HTMLElement | null;
    private readonly diagram: go.Diagram;
    private overview: go.Overview | null = null;
    private idCounter = 1;
    private showMessages = true;
    private undoEnabled = true;
    private redoEnabled = true;
    private helpEnabled = true;
    private suppressModelEvents = false;
    private pending: PendingChanges = { nodesAdded: [], nodesRemoved: [], linksAdded: [], linksRemoved: [] };
    private linkValidator: LinkValidator | null = null;

    constructor(options: DiagramOptions) {
        super();
        this.div = options.div;
        this.catalog = options.catalog;
        this.overviewDiv = options.overviewDiv ?? null;
        this.overviewContainer = options.overviewContainer ?? null;
        this.zoomLabel = options.zoomLabel ?? null;
        this.diagram = this.initDiagram();
        this.catalog.on('portTypesChanged', () => this.updatePortBindings());
    }

    get goDiagram(): go.Diagram {
        return this.diagram;
    }

    setLinkValidator(fn: LinkValidator | null): void {
        this.linkValidator = fn;
    }

    addDiagramNode(node: DiagramNode): string {
        const data = this.diagramNodeToData(node);
        this.diagram.startTransaction('add node');
        this.diagram.model.addNodeData(data);
        this.diagram.commitTransaction('add node');
        return data.id;
    }

    /// External-drop entry point — used by the HTML palette to inject a
    /// palette element at the cursor position. `clientX`/`clientY` are the
    /// browser viewport coords from the `drop` event; the method converts
    /// them to diagram document coords before placing the node.
    dropNodeFromPalette(typeId: string, clientX: number, clientY: number): string | null {
        const div = this.diagram.div;
        if (div === null) return null;
        const rect = div.getBoundingClientRect();
        const viewPoint = new go.Point(clientX - rect.left, clientY - rect.top);
        const docPoint = this.diagram.transformViewToDoc(viewPoint);
        const definition = this.catalog.getNodeType(typeId);
        const data = this.paletteDataToDiagram(definition ?? null, { id: typeId }, docPoint);
        this.diagram.startTransaction('drop palette node');
        this.diagram.model.addNodeData(data);
        this.diagram.commitTransaction('drop palette node');
        // Template bakes the socket stroke at init — a node dropped after
        // a theme flip would use the stale value; re-apply for this node.
        this.applySocketTheme();
        // Auto-select the just-dropped node so the Properties panel
        // immediately reflects it — selecting fires the node template's
        // selectionChanged → 'nodeSelected', which the host wires to
        // renderProperties. Matches the established host selection behaviour.
        const dropped = this.diagram.findNodeForKey(data.id);
        if (dropped !== null) {
            // go.Diagram.select(part) deselects all others and selects the
            // given part in one call. Not in the local ambient typings
            // (same gap as toolTip/contextMenu above) — cast through unknown.
            (this.diagram as unknown as { select(p: go.Part): void }).select(dropped);
        }
        return data.id;
    }

    removeDiagramNode(nodeId: string): void {
        const node = this.diagram.findNodeForKey(nodeId);
        if (node === null) {
            return;
        }
        this.diagram.startTransaction('remove node');
        this.diagram.remove(node);
        this.diagram.commitTransaction('remove node');
    }

    moveNode(nodeId: string, x: number, y: number): void {
        const node = this.diagram.findNodeForKey(nodeId);
        if (node === null) {
            return;
        }
        this.diagram.startTransaction('move node');
        node.location = new go.Point(x, y);
        this.diagram.commitTransaction('move node');
        this.emit('nodeMoved', { node: this.dataToDiagramNode(node.data as NodeData) });
    }

    addLink(link: Link): boolean {
        const data = this.linkToData(link);
        if (!this.canLinkData(data.from, data.fromPort, data.to, data.toPort)) {
            return false;
        }
        this.diagram.startTransaction('add link');
        this.diagram.model.addLinkData(data);
        this.diagram.commitTransaction('add link');
        return true;
    }

    removeLink(link: Link): void {
        const data = this.linkToData(link);
        const target = (this.diagram.model.linkDataArray as LinkData[]).find(
            (l) => l.from === data.from && l.to === data.to && l.fromPort === data.fromPort && l.toPort === data.toPort
        );
        if (target === undefined) {
            return;
        }
        this.diagram.startTransaction('remove link');
        this.diagram.model.removeLinkData(target);
        this.diagram.commitTransaction('remove link');
    }

    addPort(nodeId: string, direction: PortDirection, port: Port): void {
        const node = this.diagram.findNodeForKey(nodeId);
        if (node === null) {
            return;
        }
        const data = node.data as NodeData;
        const list: PortData[] = direction === 'in' ? data.inPorts : data.outPorts;
        if (list.some((p) => p.id === port.id)) {
            return;
        }
        this.diagram.startTransaction('add port');
        this.diagram.model.insertArrayItem(list, list.length, this.portToData(port, direction));
        this.diagram.commitTransaction('add port');
        this.updatePortBindings();
    }

    removePort(nodeId: string, direction: PortDirection, portId: string): void {
        const node = this.diagram.findNodeForKey(nodeId);
        if (node === null) {
            return;
        }
        const data = node.data as NodeData;
        const list: PortData[] = direction === 'in' ? data.inPorts : data.outPorts;
        const index = list.findIndex((p) => p.id === portId);
        if (index < 0) {
            return;
        }

        this.diagram.startTransaction('remove port');
        const linksToRemove: go.Link[] = [];
        this.diagram.links.each((link) => {
            const ld = link.data as LinkData;
            if (ld.from === nodeId && ld.fromPort === portId) {
                linksToRemove.push(link);
            }
            if (ld.to === nodeId && ld.toPort === portId) {
                linksToRemove.push(link);
            }
        });
        for (const link of linksToRemove) {
            this.diagram.model.removeLinkData(link.data);
        }
        this.diagram.model.removeArrayItem(list, index);
        this.diagram.commitTransaction('remove port');
    }

    updatePortType(nodeId: string, direction: PortDirection, portId: string, type: string): void {
        const node = this.diagram.findNodeForKey(nodeId);
        if (node === null) {
            return;
        }
        const data = node.data as NodeData;
        const list: PortData[] = direction === 'in' ? data.inPorts : data.outPorts;
        const portData = list.find((p) => p.id === portId);
        if (portData === undefined) {
            return;
        }
        this.diagram.startTransaction('update port type');
        this.diagram.model.setDataProperty(portData, 'type', type);
        this.diagram.commitTransaction('update port type');
        this.updatePortBindings();
    }

    /// Replaces a node's declared in/out ports with a freshly computed
    /// set (server recomputed them from the element's live parameter
    /// config — Math formula vars, LogicalCondition operator arity, …).
    /// Web grow-on-connect siblings (isSibling) are preserved — the
    /// server set is authoritative only for declared/dynamic-by-param
    /// sockets, not for runtime-spawned ones. Links whose endpoint port
    /// on THIS node no longer exists are pruned; survivors keep their
    /// connections. No-ops when nothing actually changed.
    setNodePorts(
        nodeId: string,
        inPorts: ReadonlyArray<{ key: string; name: string; description: string; type: string; maxLinks: number; availableTypes?: string[]; isDynamic?: boolean; dynamicMode?: string }>,
        outPorts: ReadonlyArray<{ key: string; name: string; description: string; type: string; maxLinks: number; availableTypes?: string[]; isDynamic?: boolean; dynamicMode?: string }>,
    ): void {
        const node = this.diagram.findNodeForKey(nodeId);
        if (node === null) return;
        const data = node.data as NodeData;

        const toData = (p: { key: string; name: string; description: string; type: string; maxLinks: number; availableTypes?: string[]; isDynamic?: boolean; dynamicMode?: string }, dir: PortDirection): PortData => ({
            id: p.key,
            name: p.name,
            description: p.description,
            type: p.type,
            maxLinks: p.maxLinks,
            direction: dir,
            availableTypes: p.availableTypes ?? [],
            isDynamic: p.isDynamic ?? false,
            dynamicMode: p.dynamicMode ?? '',
            isSibling: false,
        });

        // Keep runtime grow-on-connect siblings; server doesn't model them.
        const keepSiblings = (cur: PortData[]): PortData[] => cur.filter(p => p.isSibling === true);
        const newIn:  PortData[] = [...inPorts.map(p => toData(p, 'in')),  ...keepSiblings(data.inPorts)];
        const newOut: PortData[] = [...outPorts.map(p => toData(p, 'out')), ...keepSiblings(data.outPorts)];

        const sameSet = (a: PortData[], b: PortData[]): boolean => {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (a[i].id !== b[i].id || a[i].name !== b[i].name || a[i].type !== b[i].type) return false;
            }
            return true;
        };
        if (sameSet(newIn, data.inPorts) && sameSet(newOut, data.outPorts)) return;

        const inIds  = new Set(newIn.map(p => p.id));
        const outIds = new Set(newOut.map(p => p.id));

        this.diagram.startTransaction('update node sockets');
        // Drop links whose endpoint on THIS node references a port that
        // no longer exists. Links between surviving ports stay intact.
        const dead: go.Link[] = [];
        this.diagram.links.each((link) => {
            const ld = link.data as LinkData;
            if (ld.from === nodeId && !outIds.has(ld.fromPort)) dead.push(link);
            else if (ld.to === nodeId && !inIds.has(ld.toPort)) dead.push(link);
        });
        for (const link of dead) this.diagram.model.removeLinkData(link.data);

        this.diagram.model.setDataProperty(data, 'inPorts', newIn);
        this.diagram.model.setDataProperty(data, 'outPorts', newOut);
        this.diagram.commitTransaction('update node sockets');
        this.updatePortBindings();
    }

    updateNode(nodeId: string, patch: { name?: string; description?: string; color?: string; border?: string }): void {
        const node = this.diagram.findNodeForKey(nodeId);
        if (node === null) {
            return;
        }
        const data = node.data as NodeData;
        this.diagram.startTransaction('update node');
        if (patch.name !== undefined) {
            this.diagram.model.setDataProperty(data, 'name', patch.name);
        }
        if (patch.description !== undefined) {
            this.diagram.model.setDataProperty(data, 'description', patch.description);
        }
        if (patch.color !== undefined) {
            this.diagram.model.setDataProperty(data, 'color', patch.color);
        }
        if (patch.border !== undefined) {
            this.diagram.model.setDataProperty(data, 'border', patch.border);
        }
        this.diagram.commitTransaction('update node');
    }

    setNodeMessage(nodeId: string, message: string): void {
        const node = this.diagram.findNodeForKey(nodeId);
        if (node === null) {
            return;
        }
        this.diagram.startTransaction('update message');
        this.diagram.model.setDataProperty(node.data, 'message', message);
        this.diagram.commitTransaction('update message');
        this.applyMessageVisibility();
    }

    /// Persist a single param-value override onto the diagram node data so a
    /// future dataToDiagramNode sees the change. Passing `undefined`
    /// removes the key — restoring the schema default on next read.
    setNodeParamValue(nodeId: string, paramName: string, value: string | undefined): void {
        const node = this.diagram.findNodeForKey(nodeId);
        if (node === null) return;
        const data = node.data as NodeData;
        const current = { ...(data.paramValues ?? {}) };
        if (value === undefined) delete current[paramName];
        else current[paramName] = value;
        this.diagram.startTransaction('update paramValues');
        this.diagram.model.setDataProperty(data, 'paramValues', current);
        this.diagram.commitTransaction('update paramValues');
    }

    /// Updates the node's display label on the canvas. Empty value falls
    /// back to the palette default captured at drop time (data.parameters
    /// whose schema flagged itself as the name editor) — never leaves the
    /// node label blank.
    setNodeName(nodeId: string, value: string): void {
        const node = this.diagram.findNodeForKey(nodeId);
        if (node === null) return;
        const data = node.data as NodeData;
        const display = value.length > 0 ? value : (data.parameters?.find(p => p.name === 'Name')?.defaultValue ?? data.name);
        this.diagram.startTransaction('update name');
        this.diagram.model.setDataProperty(data, 'name', display);
        this.diagram.commitTransaction('update name');
    }

    setShowNodeMessages(show: boolean): void {
        this.showMessages = show;
        this.applyMessageVisibility();
    }

    setReadOnly(readonly: boolean): void {
        const value = readonly;
        this.diagram.isReadOnly = value;
        this.diagram.allowDrop = !value;
        this.diagram.allowCopy = !value;
        this.diagram.allowDelete = !value;
        this.diagram.allowLink = !value;
        this.diagram.allowMove = !value;
    }

    /// Repaints the overview viewport indicator using the current CSS
    /// theme tokens (--accent for stroke, --bg-elev for the dim region).
    /// Safe to call any number of times — read tokens from the live DOM
    /// at every call so a theme switch can re-invoke it.
    /// Current socket-outline color from the CSS theme token. Read live
    /// so a theme flip picks up the inverted value. Falls back to a
    /// mid-grey if the token is absent (older CSS).
    private socketStroke(): string {
        const v = getComputedStyle(document.documentElement)
            .getPropertyValue('--socket-stroke').trim();
        return v.length > 0 ? v : '#8c8c8c';
    }

    /// Re-strokes every port square after a theme switch so the sockets
    /// stay visible against the new canvas color (the stroke inverts:
    /// light on dark theme, dark on light). Iterates live nodes' ports.
    applySocketTheme(): void {
        const stroke = this.socketStroke();
        this.diagram.nodes.each((node) => {
            // go.Node.ports (iterator of port GraphObjects) isn't in the
            // local ambient typings — same gap as select()/clearSelection().
            const ports = (node as unknown as { ports?: { each(cb: (p: go.GraphObject) => void): void } }).ports;
            ports?.each((p: go.GraphObject) => {
                const shape = p as go.Shape;
                if (shape.stroke !== stroke) shape.stroke = stroke;
            });
        });
        this.diagram.ss.requestRedraw();
    }

    applyOverviewTheme(): void {
        if (this.overview === null) return;
        const box = this.overview.box;
        const shape = box?.findObject('BOX') as go.Shape | null;
        if (shape !== null && shape !== undefined) {
            const cs = getComputedStyle(document.documentElement);
            const accent = cs.getPropertyValue('--accent').trim() || '#007acc';
            shape.stroke = accent;
            shape.strokeWidth = 1.5;
            shape.fill = null;
        }
    }

    setOverviewVisible(visible: boolean): void {
        this.diagram.ss.setOverviewVisible(visible);
        this.overviewContainer?.classList.toggle('hidden', !visible);
    }

    /// Recenters and rescales the viewport so the entire diagram is visible.
    /// Uses commandHandler.zoomToFit which preserves an aspect-correct
    /// fit; safe to call on empty diagrams (no-op).
    zoomToFit(): void {
        try {
            this.diagram.commandHandler.zoomToFit();
        } catch { /* commandHandler missing in test env */ }
    }

    setZoom(scale: number): void {
        const value = Math.max(0.2, Math.min(3, scale));
        this.diagram.scale = value;
        this.updateZoomLabel();
    }

    resize(width: number, height: number): void {
        this.diagram.ss.resize(width, height);
    }

    setTheme({
        diagramBackground,
        overviewBackground,
        gridColor,
        linkMaxLightness,
        overviewBorderColor,
        overviewViewportColor,
        overviewViewportFill,
    }: DiagramThemeOptions): void {
        if (diagramBackground !== undefined) {
            this.div.style.background = diagramBackground;
            if (this.div.parentElement !== null) {
                this.div.parentElement.style.background = diagramBackground;
            }
        }
        if (this.overviewContainer !== null && overviewBackground !== undefined) {
            this.overviewContainer.style.background = overviewBackground;
        }
        this.diagram.ss.setTheme({
            background: diagramBackground,
            gridColor,
            linkMaxLightness,
            overviewBackground,
            overviewBorderColor,
            overviewViewportColor,
            overviewViewportFill,
        });
    }

    enableUndo(enabled: boolean): void {
        this.undoEnabled = enabled;
    }

    enableRedo(enabled: boolean): void {
        this.redoEnabled = enabled;
    }

    enableHelp(enabled: boolean): void {
        this.helpEnabled = enabled;
    }

    canUndo(): boolean {
        return this.undoEnabled && this.diagram.commandHandler.canUndo();
    }

    canRedo(): boolean {
        return this.redoEnabled && this.diagram.commandHandler.canRedo();
    }

    undo(): void {
        if (!this.undoEnabled) {
            return;
        }
        if (this.diagram.commandHandler.canUndo()) {
            this.diagram.commandHandler.undo();
        }
    }

    redo(): void {
        if (!this.redoEnabled) {
            return;
        }
        if (this.diagram.commandHandler.canRedo()) {
            this.diagram.commandHandler.redo();
        }
    }

    cutSelection(): void {
        if (!this.diagram.commandHandler.canCutSelection()) {
            return;
        }
        this.diagram.commandHandler.cutSelection();
    }

    copySelection(): void {
        if (!this.diagram.commandHandler.canCopySelection()) {
            return;
        }
        this.diagram.commandHandler.copySelection();
    }

    pasteSelection(): void {
        if (!this.diagram.commandHandler.canPasteSelection()) {
            return;
        }
        this.diagram.commandHandler.pasteSelection(this.diagram.lastInput.documentPoint);
    }

    clear(): void {
        // The diagram engine forbids replacing Diagram.model inside a
        // transaction — and wrapping the swap in startTransaction/commit
        // is itself "inside a transaction", which is what threw on New
        // strategy.
        // Replace the model directly, after rolling back any in-progress
        // transaction (a debounced socket-refresh from the previous
        // diagram can still own one). Same pattern as load().
        this.suppressModelEvents = true;
        const um = (this.diagram as unknown as { undoManager?: { isInTransaction?: boolean } }).undoManager;
        let guard = 0;
        while (um?.isInTransaction === true && guard++ < 10) {
            try { (this.diagram as unknown as { rollbackTransaction(): void }).rollbackTransaction(); }
            catch { break; }
        }
        this.diagram.model = this.makeEmptyModel();
        this.suppressModelEvents = false;
    }

    load(nodes: DiagramNode[], links: Link[]): void {
        this.suppressModelEvents = true;
        // The diagram engine forbids replacing Diagram.model inside a
        // transaction. A debounced socket-refresh / port mutation from
        // the previously
        // open strategy can still have one open when the user opens
        // another. Force any in-progress transaction to roll back first —
        // it belongs to the diagram we're discarding anyway.
        const um = (this.diagram as unknown as { undoManager?: { isInTransaction?: boolean } }).undoManager;
        let guard = 0;
        while (um?.isInTransaction === true && guard++ < 10) {
            try { (this.diagram as unknown as { rollbackTransaction(): void }).rollbackTransaction(); }
            catch { break; }
        }
        const nodeDataArray = nodes.map((node) => this.diagramNodeToData(node));
        const linkDataArray = links.map((link) => this.linkToData(link));
        const model = new go.GraphLinksModel();
        model.nodeKeyProperty = 'id';
        model.linkFromPortIdProperty = 'fromPort';
        model.linkToPortIdProperty = 'toPort';
        model.nodeDataArray = nodeDataArray;
        model.linkDataArray = linkDataArray;
        this.diagram.model = model;
        this.applyMessageVisibility();
        this.applySocketTheme();
        this.suppressModelEvents = false;
        this.emit('loadFinished', {
            nodes: nodeDataArray.map((data) => this.dataToDiagramNode(data)),
            links: linkDataArray.map((data) => this.dataToLink(data)),
        });
    }

    save(): { nodes: DiagramNode[]; links: Link[] } {
        const nodes = (this.diagram.model.nodeDataArray as NodeData[]).map((data) => this.dataToDiagramNode(data));
        const links = (this.diagram.model.linkDataArray as LinkData[]).map((data) => this.dataToLink(data));
        return { nodes, links };
    }

    private initDiagram(): go.Diagram {
        const $ = go.GraphObject.make;
        const portSize = 8;

        // Tooltip helper — the textBinding picks the data property to show.
        // For sockets we fall back to "name (type)" when description is
        // empty so hover always yields something meaningful (most palette
        // ports ship with description = ""). The whole adornment hides
        // when the resolved text is empty so the user doesn't see a blank
        // rectangle on stripped-down nodes.
        const makeTooltip = (textBinding: string, fallback?: (data: unknown) => string) =>
            $(
                go.Adornment,
                'Auto',
                new go.Binding('visible', '', (data: unknown) => {
                    const direct = (data as Record<string, unknown> | null)?.[textBinding];
                    if (typeof direct === 'string' && direct.length > 0) return true;
                    if (fallback !== undefined && fallback(data).length > 0) return true;
                    return false;
                }),
                $(go.Shape, 'RoundedRectangle', { fill: '#222', stroke: '#444', strokeWidth: 1 }),
                $(
                    go.TextBlock,
                    { margin: 6, stroke: '#f0f0f0', font: '12px Segoe UI' },
                    new go.Binding('text', '', (data: unknown) => {
                        const direct = (data as Record<string, unknown> | null)?.[textBinding];
                        if (typeof direct === 'string' && direct.length > 0) return direct;
                        return fallback?.(data) ?? '';
                    })
                )
            );

        const portTooltipFallback = (data: unknown): string => {
            const d = data as { name?: string; type?: string } | null;
            const name = d?.name ?? '';
            const type = d?.type ?? '';
            if (name.length === 0 && type.length === 0) return '';
            if (type.length === 0) return name;
            if (name.length === 0) return `(${type})`;
            return `${name} (${type})`;
        };

        const portTemplate = (isInput: boolean) =>
            $(
                go.Panel,
                'Auto',
                {
                    margin: new go.Margin(4, 0),
                    cursor: 'pointer',
                    mouseEnter: (_e: unknown, obj: go.GraphObject) => this.emitPortHover(obj, true),
                    mouseLeave: (_e: unknown, obj: go.GraphObject) => this.emitPortHover(obj, false),
                    click: (_e: unknown, obj: go.GraphObject) => this.emitPortSelected(obj),
                    toolTip: makeTooltip('description', portTooltipFallback),
                },
                $(
                    go.Shape,
                    'Rectangle',
                    {
                        name: 'PORT',
                        desiredSize: new go.Size(portSize, portSize),
                        stroke: this.socketStroke(),
                        strokeWidth: 1,
                        portId: '',
                        fromLinkable: !isInput,
                        toLinkable: isInput,
                        fromSpot: isInput ? go.Spot.Left : go.Spot.Right,
                        toSpot: isInput ? go.Spot.Left : go.Spot.Right,
                        toMaxLinks: isInput ? 1 : Infinity,
                    },
                    new go.Binding('portId', 'id'),
                    new go.Binding('toMaxLinks', 'maxLinks', (v: unknown) => {
                        const n = typeof v === 'number' ? v : 0;
                        return isInput && n > 0 ? n : Infinity;
                    }),
                    new go.Binding('fill', 'type', (t: unknown) => this.getPortColor(typeof t === 'string' ? t : ''))
                )
            );

        const nodeTemplate = $(
            go.Node,
            'Vertical',
            {
                selectionAdorned: true,
                locationSpot: go.Spot.Center,
                selectionChanged: (part: go.Part) => {
                    this.emit('nodeSelected', { node: this.dataToDiagramNode(part.data as NodeData), selected: part.isSelected });
                },
                mouseEnter: (_e: unknown, node: go.Node) => {
                    this.emit('nodeHover', { node: this.dataToDiagramNode(node.data as NodeData), hovering: true });
                },
                mouseLeave: (_e: unknown, node: go.Node) => {
                    this.emit('nodeHover', { node: this.dataToDiagramNode(node.data as NodeData), hovering: false });
                },
                doubleClick: (_e: unknown, node: go.Node) => {
                    this.emit('nodeOpen', { nodes: [this.dataToDiagramNode(node.data as NodeData)] });
                },
            },
            new go.Binding('location', 'loc', go.Point.parse).makeTwoWay(go.Point.stringify),
            $(
                go.Panel,
                'Spot',
                $(
                    go.Panel,
                    'Auto',
                    {
                        name: 'BODY',
                        isPanelMain: true,
                    },
                    new go.Binding('minSize', '', (data: unknown) => this.calcNodeSize(data as NodeData)),
                    $(
                        go.Shape,
                        'RoundedRectangle',
                        {
                            fill: '#d7d7d7',
                            stroke: '#8c8c8c',
                            strokeWidth: 1.5,
                        },
                        // The server returns color/border as "" (empty
                        // string, not null) for nodes with no override —
                        // and an empty string binding OVERRIDES the
                        // static fallback, leaving the shape with no
                        // brush so the node renders transparent (black on
                        // the dark canvas). Fall back to the neutral
                        // palette when the value is blank.
                        new go.Binding('fill', 'color', (c: unknown) =>
                            typeof c === 'string' && c.length > 0 ? c : '#d7d7d7'),
                        new go.Binding('stroke', 'border', (b: unknown) =>
                            typeof b === 'string' && b.length > 0 ? b : '#8c8c8c')
                    ),
                    $(
                        go.Panel,
                        'Horizontal',
                        {
                            padding: new go.Margin(8, 10),
                            alignment: go.Spot.Center,
                        },
                        $(
                            go.Picture,
                            {
                                // Fixed 18×18 box, image FILLED to it. Some
                                // source SVGs (e.g. Flag.svg) carry only a
                                // viewBox with no intrinsic width/height —
                                // the diagram engine can't scale those under Uniform and
                                // they render tiny. Fill forces every icon
                                // to the exact 18×18 box; the ≤5% aspect
                                // skew on non-square glyphs is invisible at
                                // this size and consistency wins.
                                desiredSize: new go.Size(18, 18),
                                imageStretch: (go as unknown as { GraphObject: { Fill: unknown } }).GraphObject.Fill,
                                margin: new go.Margin(0, 6, 0, 0),
                            },
                            new go.Binding('source', 'icon'),
                            new go.Binding('visible', 'icon', (v: unknown) => typeof v === 'string' && v.length > 0)
                        ),
                        $(
                            go.TextBlock,
                            {
                                font: '600 12px Segoe UI',
                                stroke: '#1b1b1b',
                                textAlign: 'center',
                                width: 120,
                                wrap: go.TextBlock.WrapFit,
                            },
                            new go.Binding('text', 'name')
                        )
                    )
                ),
                $(
                    go.Panel,
                    'Vertical',
                    {
                        alignment: new go.Spot(0, 0.5, 0, 0),
                        alignmentFocus: go.Spot.Right,
                        itemTemplate: portTemplate(true),
                    },
                    new go.Binding('itemArray', 'inPorts')
                ),
                $(
                    go.Panel,
                    'Vertical',
                    {
                        alignment: new go.Spot(1, 0.5, 0, 0),
                        alignmentFocus: go.Spot.Left,
                        itemTemplate: portTemplate(false),
                    },
                    new go.Binding('itemArray', 'outPorts')
                )
            ),
            $(
                go.TextBlock,
                {
                    name: 'MESSAGE',
                    margin: new go.Margin(4, 0, 0, 0),
                    stroke: '#ff6d6d',
                    font: '11px Segoe UI',
                    visible: false,
                },
                new go.Binding('text', 'message')
            )
        ) as go.Node;

        (nodeTemplate as unknown as { toolTip: unknown; contextMenu: unknown }).toolTip = makeTooltip('description');
        (nodeTemplate as unknown as { contextMenu: unknown }).contextMenu = this.contextMenuSentinel();

        const linkTemplate = $(
            go.Link,
            {
                routing: go.Link.AvoidsNodes,
                curve: go.Link.JumpOver,
                corner: 6,
                reshapable: false,
                relinkableFrom: true,
                relinkableTo: true,
                selectionChanged: (part: go.Part) => {
                    this.emit('linkSelected', { link: this.dataToLink(part.data as LinkData), selected: part.isSelected });
                },
                mouseEnter: (_e: unknown, link: go.Link) => {
                    this.emit('linkHover', { link: this.dataToLink(link.data as LinkData), hovering: true });
                },
                mouseLeave: (_e: unknown, link: go.Link) => {
                    this.emit('linkHover', { link: this.dataToLink(link.data as LinkData), hovering: false });
                },
            },
            new go.Binding('points').makeTwoWay(),
            $(go.Shape, { stroke: '#8f8f8f', strokeWidth: 2 })
        ) as go.Link;

        (linkTemplate as unknown as { contextMenu: unknown }).contextMenu = this.contextMenuSentinel();

        const diagram = $(go.Diagram, this.div, {
            allowDrop: true,
            initialContentAlignment: go.Spot.Center,
            'undoManager.isEnabled': true,
            'toolManager.hoverDelay': 120,
            'linkingTool.portGravity': 12,
            'relinkingTool.portGravity': 12,
            'linkingTool.isUnconnectedLinkValid': false,
            'relinkingTool.isUnconnectedLinkValid': false,
        }) as go.Diagram;

        diagram.nodeTemplate = nodeTemplate;
        diagram.linkTemplate = linkTemplate;
        diagram.contextMenu = this.contextMenuSentinel() as go.Adornment;
        diagram.model = this.makeEmptyModel();

        diagram.addDiagramListener('SelectionMoved', (e) => {
            e.subject.each((part) => {
                if (part instanceof go.Node) {
                    this.emit('nodeMoved', { node: this.dataToDiagramNode(part.data as NodeData) });
                }
            });
        });

        diagram.addDiagramListener('ExternalObjectsDropped', (e) => {
            diagram.startTransaction('convert palette nodes');
            let lastId: string | null = null;
            e.subject.each((part) => {
                if (!(part instanceof go.Node)) {
                    return;
                }
                const paletteData = part.data as { id: string };
                const definition = this.catalog.getNodeType(paletteData.id);
                const converted = this.paletteDataToDiagram(definition ?? null, paletteData, part.location);
                diagram.model.removeNodeData(paletteData);
                diagram.model.addNodeData(converted);
                lastId = converted.id;
            });
            diagram.commitTransaction('convert palette nodes');
            // Removing the original palette part dropped the selection —
            // re-select the converted node so Properties tracks it.
            if (lastId !== null) {
                const node = diagram.findNodeForKey(lastId);
                if (node !== null) {
                    (diagram as unknown as { select(p: go.Part): void }).select(node);
                }
            }
        });

        diagram.addModelChangedListener((evt) => this.onModelChanged(evt));
        diagram.toolManager.linkingTool.linkValidation = (fromNode, fromPort, toNode, toPort) =>
            this.validateLink(fromNode, fromPort, toNode, toPort);
        diagram.toolManager.relinkingTool.linkValidation = (fromNode, fromPort, toNode, toPort) =>
            this.validateLink(fromNode, fromPort, toNode, toPort);

        if (this.overviewDiv !== null) {
            // Replace the default box (magenta stroke) with a Part bound to the
            // current --accent token. Done at construction because reassigning
            // `box` after first paint is racey with the engine's internal updates.
            const cs = getComputedStyle(document.documentElement);
            const accent = cs.getPropertyValue('--accent').trim() || '#007acc';
            const customBox = $(
                go.Part,
                { layerName: 'Foreground', selectable: false },
                $(go.Shape, { figure: 'Rectangle', name: 'BOX', fill: null, stroke: accent, strokeWidth: 1.5 }),
            );
            this.overview = $(go.Overview, this.overviewDiv, {
                observed: diagram,
                box: customBox,
            }) as go.Overview;
        }

        diagram.addDiagramListener('ViewportBoundsChanged', () => this.updateZoomLabel());
        this.updateZoomLabel(diagram);
        this.installContextMenu(diagram);
        return diagram;
    }

    /// Context-menu colors pulled live from the CSS theme tokens. The
    /// menu is rebuilt on every open (see installContextMenu), so this
    /// always reflects the *current* theme, not the one at page load.
    private ctxTheme(): { bg: string; border: string; text: string; dim: string; hover: string } {
        const cs = getComputedStyle(document.documentElement);
        const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
        return {
            bg:     v('--bg-elev',  '#1E2329'),
            border: v('--border',   '#2B3139'),
            text:   v('--text',     '#EAECEF'),
            dim:    v('--text-dim', '#848E9C'),
            hover:  v('--bg-hover', '#2B3139'),
        };
    }

    /// Wraps the stock ContextMenuTool so the menu adornment is rebuilt
    /// from scratch on every open. That makes it (a) follow live theme
    /// switches and (b) reflect the current selection / clipboard /
    /// undo state — a once-built adornment would freeze both.
    /// Sentinel menu: its only job is to make the engine treat the part as
    /// "has a context menu" so ContextMenuTool starts. The real themed,
    /// selection-aware menu is built on open by installContextMenu().
    /// Built without touching this.diagram (runs during construction,
    /// before this.diagram is assigned).
    private contextMenuSentinel(): unknown {
        const $ = go.GraphObject.make;
        return $(go.Adornment, 'Auto', $(go.Shape, { fill: null, stroke: null }));
    }

    private installContextMenu(diagram: go.Diagram): void {
        const tool = (diagram.toolManager as unknown as {
            contextMenuTool: { showContextMenu(cm: unknown, obj: unknown): void };
        }).contextMenuTool;
        const baseShow = tool.showContextMenu.bind(tool);
        tool.showContextMenu = (_cm: unknown, obj: unknown) => {
            const part = (obj as { part?: unknown } | null)?.part ?? null;
            const menu = part instanceof go.Node
                ? this.makeNodeContextMenu()
                : this.makeDiagramContextMenu();
            baseShow(menu, obj);
        };
    }

    private makeDiagramContextMenu(): unknown {
        return this.buildContextMenu([
            ['↶', 'undo',  'Undo',  'undo'],
            ['↷', 'redo',  'Redo',  'redo'],
            ['✂', 'cut',   'Cut',   'cut'],
            ['⧉', 'copy',  'Copy',  'copy'],
            ['⎘', 'paste', 'Paste', 'paste'],
        ]);
    }

    private makeNodeContextMenu(): unknown {
        return this.buildContextMenu([
            ['↶', 'undo',       'Undo',       'undo'],
            ['↷', 'redo',       'Redo',       'redo'],
            ['✂', 'cut',        'Cut',        'cut'],
            ['⧉', 'copy',       'Copy',       'copy'],
            ['⎘', 'paste',      'Paste',      'paste'],
            ['↗', 'ctxOpen',    'Open',       'open'],
            ['✕', 'delete',     'Delete',     'delete'],
            ['⚙', 'properties', 'Properties', 'properties'],
            ['?', 'ctxHelp',    'Help',       'help'],
        ]);
    }

    /// Whether a command is currently actionable. Drives which rows the
    /// menu shows: nothing-to-undo / empty-clipboard / no-selection
    /// entries are dropped instead of shown dead.
    private ctxEnabled(cmd: ContextCommand): boolean {
        const ch = (this.diagram as unknown as {
            commandHandler: {
                canUndo(): boolean; canRedo(): boolean;
                canCutSelection(): boolean; canCopySelection(): boolean;
                canPasteSelection(): boolean; canDeleteSelection(): boolean;
            };
        }).commandHandler;
        switch (cmd) {
            case 'undo':   return ch.canUndo();
            case 'redo':   return ch.canRedo();
            case 'cut':    return ch.canCutSelection();
            case 'copy':   return ch.canCopySelection();
            case 'paste':  return ch.canPasteSelection();
            case 'delete': return ch.canDeleteSelection();
            case 'open':
            case 'properties':
            case 'help':   return (this.diagram.selection as unknown as { count: number }).count > 0;
            default:       return true;
        }
    }

    /// Dark/light-themed Adornment: a rounded panel background + a
    /// vertical stack of full-width rows (glyph column + label) so the
    /// menu reads as one tidy block, not the engine's stock white buttons.
    /// Returns null when no row applies (e.g. right-click on blank
    /// canvas with an empty clipboard and nothing to undo).
    private buildContextMenu(items: [string, Parameters<typeof t>[0], string, ContextCommand][]): unknown {
        const $ = go.GraphObject.make;
        const c = this.ctxTheme();
        const usable = items.filter(([, , , cmd]) => this.ctxEnabled(cmd));
        if (usable.length === 0) return null;
        return $(
            go.Adornment, 'Auto',
            $(go.Shape, 'RoundedRectangle', { fill: c.bg, stroke: c.border, strokeWidth: 1, parameter1: 5 }),
            $(go.Panel, 'Vertical', { margin: 4 },
                ...usable.map(([glyph, key, fallback, cmd]) => this.makeContextButton(glyph, key, fallback, cmd, c)),
            ),
        );
    }

    /// One full-width context row: dimmed glyph column + localized label.
    private makeContextButton(
        glyph: string, key: Parameters<typeof t>[0], fallback: string,
        cmd: ContextCommand, c: { text: string; dim: string; hover: string },
    ): unknown {
        const $ = go.GraphObject.make;
        const hStretch = (go as unknown as { GraphObject: { Horizontal: unknown } }).GraphObject.Horizontal;
        return $(
            'ContextMenuButton',
            {
                stretch: hStretch,
                'ButtonBorder.fill': 'transparent',
                'ButtonBorder.stroke': null,
                '_buttonFillOver': c.hover,
                '_buttonStrokeOver': null as unknown as string,
            },
            $(go.Panel, 'Horizontal', { stretch: hStretch, alignment: (go as unknown as { Spot: { Left: unknown } }).Spot.Left },
                $(go.TextBlock, glyph, {
                    width: 18, font: '12px Segoe UI', stroke: c.dim,
                    textAlign: 'center', margin: new go.Margin(5, 6, 5, 8),
                }),
                $(go.TextBlock, t(key, fallback), {
                    font: '12px Segoe UI', stroke: c.text,
                    margin: new go.Margin(5, 14, 5, 2),
                }),
            ),
            { click: () => this.emitContext(cmd) },
        );
    }

    private emitContext(command: ContextCommand): void {
        const nodes: DiagramNode[] = [];
        const links: Link[] = [];
        this.diagram.selection.each((part) => {
            if (part instanceof go.Node) {
                nodes.push(this.dataToDiagramNode(part.data as NodeData));
            }
            if (part instanceof go.Link) {
                links.push(this.dataToLink(part.data as LinkData));
            }
        });

        this.emit('contextCommand', { command, nodes, links });

        if (command === 'undo') {
            this.emit('undoRequested', { nodes, links });
        }
        if (command === 'redo') {
            this.emit('redoRequested', { nodes, links });
        }
        if (command === 'properties') {
            this.emit('nodeEdit', { nodes });
            this.emit('nodeProperties', { nodes });
        }
        if (command === 'help' && this.helpEnabled) {
            this.emit('nodeHelp', { nodes });
        }
        if (command === 'open') {
            this.emit('nodeOpen', { nodes });
        }
    }

    private onModelChanged(evt: go.ChangedEvent): void {
        if (this.suppressModelEvents) {
            return;
        }

        if (evt.change === go.ChangedEvent.Insert && evt.modelChange === 'nodeDataArray') {
            this.pending.nodesAdded.push(evt.newValue as NodeData);
        }

        if (evt.change === go.ChangedEvent.Remove && evt.modelChange === 'nodeDataArray') {
            this.pending.nodesRemoved.push(evt.oldValue as NodeData);
        }

        if (evt.change === go.ChangedEvent.Insert && evt.modelChange === 'linkDataArray') {
            this.pending.linksAdded.push(evt.newValue as LinkData);
        }

        if (evt.change === go.ChangedEvent.Remove && evt.modelChange === 'linkDataArray') {
            this.pending.linksRemoved.push(evt.oldValue as LinkData);
        }

        if (evt.isTransactionFinished) {
            this.flushPendingChanges();
        }
    }

    private flushPendingChanges(): void {
        const { nodesAdded, nodesRemoved, linksAdded, linksRemoved } = this.pending;

        if (nodesAdded.length > 0) {
            this.emit('nodeAdded', { nodes: nodesAdded.map((data) => this.dataToDiagramNode(data)) });
        }
        if (nodesRemoved.length > 0) {
            this.emit('nodeRemoved', { nodes: nodesRemoved.map((data) => this.dataToDiagramNode(data)) });
        }
        if (linksAdded.length > 0) {
            // Grow-on-connect pipeline runs before linkAdded emits so the
            // outward-facing event already carries the re-targeted port id.
            // Spawning siblings here keeps the logic close to where the
            // model mutation happens; the diagram already owns its model.
            for (const linkData of linksAdded) {
                this.growDynamicSiblingIfNeeded(linkData);
            }
            this.emit('linkAdded', { links: linksAdded.map((data) => this.dataToLink(data)) });
        }
        if (linksRemoved.length > 0) {
            // Mirror grow-on-connect: when a link drops off a dynamic
            // sibling and nothing else points to it, retire the sibling
            // so the node doesn't accumulate empty sockets across edits.
            for (const linkData of linksRemoved) this.pruneOrphanSiblingIfNeeded(linkData);
            this.emit('linkRemoved', { links: linksRemoved.map((data) => this.dataToLink(data)) });
        }

        this.pending = { nodesAdded: [], nodesRemoved: [], linksAdded: [], linksRemoved: [] };
    }

    /// <summary>
    /// If the link's target port is a Diagram.Core-style dynamic anchor
    /// (<c>isDynamic && dynamicMode === 'onConnect'</c>), spawn a fresh
    /// sibling port on the target node with the source-side socket type
    /// and re-target the link to the sibling. Anchor stays open for the
    /// next connect — mirrors the desktop Chart / Variable behaviour.
    /// </summary>
    private growDynamicSiblingIfNeeded(linkData: LinkData): void {
        const toNode = this.diagram.findNodeForKey(linkData.to);
        if (toNode === null) return;
        const toNodeData = toNode.data as NodeData;
        const anchor = toNodeData.inPorts.find((p) => p.id === linkData.toPort);
        if (anchor === undefined) return;
        if (anchor.isDynamic !== true || anchor.dynamicMode !== 'onConnect') return;

        // Determine source-socket type so the sibling becomes strongly typed
        // after first connect (matches Diagram.Core's CanConnectFrom path).
        const fromNode = this.diagram.findNodeForKey(linkData.from);
        const fromPorts = (fromNode?.data as NodeData | undefined)?.outPorts ?? [];
        const fromPort = fromPorts.find((p) => p.id === linkData.fromPort);
        const siblingType = fromPort?.type ?? anchor.type;

        // Pick a stable, unique sibling id. Format: "<anchor>_<seq>" so the
        // anchor and its siblings cluster together in the model array.
        const existing = toNodeData.inPorts
            .map((p) => p.id)
            .filter((id) => id === anchor.id || id.startsWith(anchor.id + '_'));
        let seq = 1;
        while (existing.includes(anchor.id + '_' + seq)) seq++;
        const siblingId = anchor.id + '_' + seq;
        const siblingName = anchor.name + ' ' + seq;

        const sibling: PortData = {
            id: siblingId,
            name: siblingName,
            description: anchor.description,
            type: siblingType,
            maxLinks: 1,
            direction: 'in',
            // Carry the parent's whitelist so downstream re-link validation
            // accepts the same set the anchor accepts.
            availableTypes: anchor.availableTypes ?? [],
            isDynamic: false,
            dynamicMode: '',
            isSibling: true,
        };

        this.diagram.startTransaction('grow dynamic sibling');
        this.diagram.model.insertArrayItem(toNodeData.inPorts, toNodeData.inPorts.length, sibling);
        // Re-target the just-added link to the new sibling. The engine reads the
        // value back from linkDataArray on the next layout, so the line moves.
        this.diagram.model.setDataProperty(linkData, 'toPort', siblingId);
        this.diagram.commitTransaction('grow dynamic sibling');
        this.updatePortBindings();
    }

    /// Counterpart to growDynamicSiblingIfNeeded: when the *last* link
    /// targeting a runtime sibling goes away, retire the sibling so the
    /// node doesn't accumulate dangling sockets across edits. Only acts
    /// on ports marked <c>isSibling = true</c> — palette-declared
    /// anchors stay intact even if no link currently uses them.
    private pruneOrphanSiblingIfNeeded(linkData: LinkData): void {
        const toNode = this.diagram.findNodeForKey(linkData.to);
        if (toNode === null) return;
        const toNodeData = toNode.data as NodeData;
        const portIdx = toNodeData.inPorts.findIndex((p) => p.id === linkData.toPort);
        if (portIdx < 0) return;
        const port = toNodeData.inPorts[portIdx];
        if (port.isSibling !== true) return;
        // Walk the rest of the model — any other link still routing into
        // this same sibling keeps it alive.
        let stillUsed = false;
        this.diagram.links.each((link) => {
            const ld = link.data as LinkData;
            if (ld.to === linkData.to && ld.toPort === linkData.toPort) {
                stillUsed = true;
            }
        });
        if (stillUsed) return;
        this.diagram.startTransaction('prune orphan sibling');
        this.diagram.model.removeArrayItem(toNodeData.inPorts, portIdx);
        this.diagram.commitTransaction('prune orphan sibling');
        this.updatePortBindings();
    }

    private emitPortSelected(obj: go.GraphObject): void {
        const portData = obj.data as PortData | undefined;
        const nodeData = obj.part?.data as NodeData | undefined;
        if (portData === undefined || nodeData === undefined) {
            return;
        }
        const direction = this.getPortDirection(nodeData, portData.id);
        this.emit('portSelected', {
            node: this.dataToDiagramNode(nodeData),
            port: this.dataToPort(portData),
            direction,
        });
    }

    private emitPortHover(obj: go.GraphObject, hovering: boolean): void {
        const portData = obj.data as PortData | undefined;
        const nodeData = obj.part?.data as NodeData | undefined;
        if (portData === undefined || nodeData === undefined) {
            return;
        }
        const direction = this.getPortDirection(nodeData, portData.id);
        this.emit('portHover', {
            node: this.dataToDiagramNode(nodeData),
            port: this.dataToPort(portData),
            direction,
            hovering,
        });
    }

    private validateLink(fromNode: go.Node, fromPort: go.GraphObject, toNode: go.Node, toPort: go.GraphObject): boolean {
        const fromPortData = (fromPort.data ?? fromPort.panel?.data) as PortData | undefined;
        const toPortData = (toPort.data ?? toPort.panel?.data) as PortData | undefined;
        if (fromPortData === undefined || toPortData === undefined) {
            return false;
        }

        const fromNodeData = fromNode.data as NodeData;
        const toNodeData = toNode.data as NodeData;
        const fromDirection = this.getPortDirection(fromNodeData, fromPortData.id);
        const toDirection = this.getPortDirection(toNodeData, toPortData.id);

        if (fromDirection !== 'out' || toDirection !== 'in') {
            return false;
        }

        if (toPortData.maxLinks > 0) {
            const current = this.countLinksToPort(toNodeData.id, toPortData.id);
            if (current >= toPortData.maxLinks) {
                return false;
            }
        }

        let allowed = true;
        if (this.linkValidator !== null) {
            allowed = this.linkValidator({
                fromNode: this.dataToDiagramNode(fromNodeData),
                fromPort: this.dataToPort(fromPortData),
                toNode: this.dataToDiagramNode(toNodeData),
                toPort: this.dataToPort(toPortData),
            });
        }

        this.emit('linkValidation', {
            fromNode: this.dataToDiagramNode(fromNodeData),
            fromPort: this.dataToPort(fromPortData),
            toNode: this.dataToDiagramNode(toNodeData),
            toPort: this.dataToPort(toPortData),
            allowed,
        });

        return allowed;
    }

    private countLinksToPort(nodeId: string, portId: string): number {
        let count = 0;
        for (const link of this.diagram.model.linkDataArray as LinkData[]) {
            if (link.to === nodeId && link.toPort === portId) {
                count += 1;
            }
        }
        return count;
    }

    private getPortDirection(nodeData: NodeData, portId: string): PortDirection {
        if (nodeData.inPorts.some((p) => p.id === portId)) {
            return 'in';
        }
        // Default to 'out' so callers always get a valid direction; the link
        // validator separately verifies that ports actually exist.
        return 'out';
    }

    private updatePortBindings(): void {
        this.diagram.updateAllTargetBindings();
    }

    private calcNodeSize(data: NodeData): go.Size {
        const inCount = data.inPorts.length;
        const outCount = data.outPorts.length;
        const rows = Math.max(inCount, outCount, 1);
        const rowHeight = 16;
        const height = Math.max(48, rows * rowHeight + 16);
        return new go.Size(170, height);
    }

    private getPortColor(typeName: string): string {
        const pt = this.catalog.getPortType(typeName);
        return pt !== null ? pt.color : '#8c8c8c';
    }

    private makeEmptyModel(): go.GraphLinksModel {
        const model = new go.GraphLinksModel();
        model.nodeKeyProperty = 'id';
        model.linkFromPortIdProperty = 'fromPort';
        model.linkToPortIdProperty = 'toPort';
        model.nodeDataArray = [];
        model.linkDataArray = [];
        return model;
    }

    private paletteDataToDiagram(
        definition: Node | null,
        fallback: { id: string },
        location: go.Point
    ): NodeData {
        const base = definition ?? new Node({ id: fallback.id, name: fallback.id });
        const id = this.generateNodeId(base.id);
        return this.diagramNodeToData(
            new DiagramNode({
                id,
                typeId: base.id,    // base.id is the palette element TypeId
                name: base.name,
                description: base.description,
                groupName: base.groupName,
                inPorts: base.inPorts.map((p) => p.clone()),
                outPorts: base.outPorts.map((p) => p.clone()),
                icon: base.icon,
                parameters: base.parameters.map((p) => ({ ...p, options: [...p.options] })),
                openAction: base.openAction,
                x: location.x,
                y: location.y,
            })
        );
    }

    private diagramNodeToData(node: DiagramNode): NodeData {
        const n = node instanceof DiagramNode ? node : new DiagramNode(node);
        return {
            id: n.id !== '' ? n.id : this.generateNodeId('node'),
            typeId: n.typeId,
            name: n.name,
            description: n.description,
            groupName: n.groupName,
            inPorts: n.inPorts.map((p) => this.portToData(p, 'in')),
            outPorts: n.outPorts.map((p) => this.portToData(p, 'out')),
            icon: n.icon,
            color: n.color,
            border: n.border,
            message: n.message,
            isPlaceholder: n.isPlaceholder,
            loc: go.Point.stringify(new go.Point(n.x, n.y)),
            openAction: n.openAction,
            // Stash the parameter schema + per-instance values on the
            // diagram model so dataToDiagramNode can round-trip them.
            // Without this
            // the Properties panel sees an empty parameters[] every time
            // the user clicks a node (we'd be re-constructing a bare
            // DiagramNode from a NodeData that lost the schema at drop).
            parameters: n.parameters.map((p) => ({ ...p, options: [...p.options] })),
            paramValues: { ...n.paramValues },
        };
    }

    private portToData(port: Port, direction: PortDirection): PortData {
        const p = port instanceof Port ? port : new Port(port);
        return {
            id: p.id,
            name: p.name,
            description: p.description,
            type: p.type,
            maxLinks: p.maxLinks,
            direction,
            availableTypes: p.availableTypes,
            isDynamic: p.isDynamic,
            dynamicMode: p.dynamicMode,
            isSibling: p.isSibling,
        };
    }

    private dataToPort(data: PortData): Port {
        return new Port({
            id: data.id,
            name: data.name,
            description: data.description,
            type: data.type,
            maxLinks: data.maxLinks,
            availableTypes: data.availableTypes ?? [],
            isDynamic: data.isDynamic ?? false,
            dynamicMode: data.dynamicMode ?? '',
            isSibling: data.isSibling ?? false,
        });
    }

    private dataToDiagramNode(data: NodeData): DiagramNode {
        const point = go.Point.parse(data.loc.length > 0 ? data.loc : '0 0');
        return new DiagramNode({
            id: data.id,
            typeId: data.typeId,
            name: data.name,
            description: data.description,
            groupName: data.groupName,
            inPorts: data.inPorts.map((p) => this.dataToPort(p)),
            outPorts: data.outPorts.map((p) => this.dataToPort(p)),
            icon: data.icon,
            openAction: data.openAction ?? '',
            x: point.x,
            y: point.y,
            color: data.color,
            border: data.border,
            message: data.message,
            isPlaceholder: data.isPlaceholder ?? false,
            // Pull the parameter schema + values back off the diagram model.
            // Both fields are optional on NodeData for backward compat with
            // older stored layouts; the DiagramNode ctor accepts empty
            // arrays/maps as defaults.
            parameters: (data.parameters ?? []).map((p) => ({ ...p, options: [...p.options] })),
            paramValues: { ...(data.paramValues ?? {}) },
        });
    }

    private linkToData(link: Link): LinkData {
        const getId = (value: string | { id: string }): string => (typeof value === 'object' ? value.id : value);
        return {
            from: getId(link.outNode),
            fromPort: getId(link.outPort),
            to: getId(link.inNode),
            toPort: getId(link.inPort),
        };
    }

    private dataToLink(data: LinkData): Link {
        return new Link({
            outNode: data.from,
            outPort: data.fromPort,
            inNode: data.to,
            inPort: data.toPort,
        });
    }

    private applyMessageVisibility(): void {
        this.diagram.nodes.each((node) => {
            const message = node.findObject('MESSAGE') as { visible: boolean } | null;
            if (message === null) {
                return;
            }
            const data = node.data as NodeData;
            const hasText = data.message.length > 0;
            message.visible = this.showMessages && hasText;
        });
    }

    private updateZoomLabel(diagram: go.Diagram = this.diagram): void {
        // Called from `initDiagram` before `this.diagram` is assigned by the
        // constructor — accept the live instance directly so the first paint
        // does not crash.
        if (this.zoomLabel === null) {
            return;
        }
        this.zoomLabel.textContent = `${Math.round(diagram.scale * 100)}%`;
    }

    private generateNodeId(prefix: string): string {
        const safe = prefix.replace(/[^a-zA-Z0-9_-]/g, '');
        const id = `${safe.length > 0 ? safe : 'node'}_${this.idCounter}`;
        this.idCounter += 1;
        return id;
    }

    private canLinkData(fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string): boolean {
        const fromNode = this.diagram.findNodeForKey(fromNodeId);
        const toNode = this.diagram.findNodeForKey(toNodeId);
        if (fromNode === null || toNode === null) {
            return false;
        }
        const fromData = fromNode.data as NodeData;
        const toData = toNode.data as NodeData;
        const fromPort = this.findPortData(fromData, fromPortId);
        const toPort = this.findPortData(toData, toPortId);
        if (fromPort === null || toPort === null) {
            return false;
        }
        if (this.getPortDirection(fromData, fromPortId) !== 'out') {
            return false;
        }
        if (this.getPortDirection(toData, toPortId) !== 'in') {
            return false;
        }
        if (toPort.maxLinks > 0) {
            if (this.countLinksToPort(toNodeId, toPortId) >= toPort.maxLinks) {
                return false;
            }
        }
        if (this.linkValidator !== null) {
            return this.linkValidator({
                fromNode: this.dataToDiagramNode(fromData),
                fromPort: this.dataToPort(fromPort),
                toNode: this.dataToDiagramNode(toData),
                toPort: this.dataToPort(toPort),
            });
        }
        return true;
    }

    private findPortData(nodeData: NodeData, portId: string): PortData | null {
        const inPort = nodeData.inPorts.find((p) => p.id === portId);
        if (inPort !== undefined) {
            return inPort;
        }
        return nodeData.outPorts.find((p) => p.id === portId) ?? null;
    }
}
