import type { DiagramDocument } from '../core/model.js';
import type {
    DiagramInteractionPermissions,
    DiagramSelection,
    DiagramViewState,
} from '../core/state.js';
import {
    Diagram as CanvasDiagram,
    type DiagramNodeInit as CanvasNodeInit,
    type LinkInit as CanvasLinkInit,
    type LinkModel,
    type NodeModel,
    type PortInit as CanvasPortInit,
    type PortModel,
} from '../ssgraph.js';
import { StockSharpCatalog } from './catalog.js';
import { EventEmitter } from './event-emitter.js';
import type {
    DiagramEvents,
    DiagramLoadOptions,
    DiagramOptions,
    DiagramThemeOptions,
    LinkValidator,
    NodeErrorKind,
    NodeErrorOptions,
} from './api.js';
import {
    DiagramNode,
    Link,
    Node,
    Port,
    type PortDirection,
} from './types.js';

export class StockSharpDiagram extends EventEmitter<DiagramEvents> {
    private readonly div: HTMLElement;
    private readonly catalog: StockSharpCatalog;
    private readonly overviewContainer: HTMLElement | null;
    private readonly zoomLabel: HTMLElement | null;
    private readonly canvas: CanvasDiagram;
    private readonly disposables: Array<() => void> = [];
    private idCounter = 1;
    private undoEnabled = true;
    private redoEnabled = true;
    private helpEnabled = true;
    private loading = false;
    private destroyed = false;
    private linkValidator: LinkValidator | null = null;

    constructor(options: DiagramOptions) {
        super();
        this.div = options.div;
        this.catalog = options.catalog;
        this.overviewContainer = options.overviewContainer ?? null;
        this.zoomLabel = options.zoomLabel ?? null;
        this.canvas = new CanvasDiagram({
            host: this.div,
            typeColors: this.portTypeColors(),
        });
        this.bindCanvasEvents();
        this.disposables.push(this.catalog.on('portTypesChanged', () => this.applySocketTheme()));
        this.updateZoomLabel();
    }

    /** Direct renderer controller. It replaces the old go-compatible escape hatch. */
    get renderer(): CanvasDiagram {
        return this.canvas;
    }

    /** @deprecated Use renderer. The returned value is the canvas renderer, not a go.Diagram. */
    get goDiagram(): CanvasDiagram {
        return this.canvas;
    }

    setLinkValidator(validator: LinkValidator | null): void {
        this.linkValidator = validator;
        this.canvas.setLinkValidator(validator === null ? null : ({ fromNode, fromPort, toNode, toPort }) => validator({
            fromNode: this.fromCanvasNode(fromNode),
            fromPort: this.fromCanvasPort(fromPort),
            toNode: this.fromCanvasNode(toNode),
            toPort: this.fromCanvasPort(toPort),
        }));
    }

    addDiagramNode(node: DiagramNode): string {
        return this.canvas.addDiagramNode(this.toCanvasNode(node));
    }

    dropNodeFromPalette(typeId: string, clientX: number, clientY: number): string | null {
        const rect = this.div.getBoundingClientRect();
        const [x, y] = this.canvas.viewToWorld(clientX - rect.left, clientY - rect.top);
        const definition = this.catalog.getNodeType(typeId) ?? new Node({ id: typeId, name: typeId });
        const id = this.generateNodeId(definition.id);
        const node = new DiagramNode({
            id,
            typeId: definition.id,
            name: definition.name,
            description: definition.description,
            groupName: definition.groupName,
            inPorts: definition.inPorts.map((port) => port.clone()),
            outPorts: definition.outPorts.map((port) => port.clone()),
            icon: definition.icon,
            parameters: definition.parameters.map((parameter) => ({ ...parameter, options: [...parameter.options] })),
            openAction: definition.openAction,
            x,
            y,
        });
        this.canvas.addDiagramNode(this.toCanvasNode(node));
        this.canvas.selectNodeById(id);
        return id;
    }

    removeDiagramNode(nodeId: string): void {
        this.canvas.removeDiagramNode(nodeId);
    }

    moveNode(nodeId: string, x: number, y: number): void {
        this.canvas.moveNode(nodeId, x, y);
    }

    addLink(link: Link): boolean {
        return this.canvas.addLink(this.toCanvasLink(link));
    }

    removeLink(link: Link): void {
        this.canvas.removeLink(this.toCanvasLink(link));
    }

    addPort(nodeId: string, direction: PortDirection, port: Port): void {
        this.canvas.addPort(nodeId, direction, this.toCanvasPort(port));
    }

    removePort(nodeId: string, direction: PortDirection, portId: string): void {
        this.canvas.removePort(nodeId, direction, portId);
    }

    updatePortType(nodeId: string, direction: PortDirection, portId: string, type: string): void {
        this.canvas.updatePortType(nodeId, direction, portId, type);
    }

    setNodePorts(
        nodeId: string,
        inPorts: ReadonlyArray<{ key: string; name: string; description: string; type: string; maxLinks: number; availableTypes?: string[]; isDynamic?: boolean; dynamicMode?: string }>,
        outPorts: ReadonlyArray<{ key: string; name: string; description: string; type: string; maxLinks: number; availableTypes?: string[]; isDynamic?: boolean; dynamicMode?: string }>,
    ): void {
        const current = this.canvas.findNode(nodeId);
        if (current === undefined) return;
        const convert = (port: typeof inPorts[number]): CanvasPortInit => ({
            id: port.key,
            name: port.name,
            description: port.description,
            type: port.type,
            maxLinks: port.maxLinks,
            availableTypes: [...(port.availableTypes ?? [])],
            isDynamic: port.isDynamic ?? false,
            dynamicMode: port.dynamicMode ?? '',
        });
        const nextIn = inPorts.map(convert);
        const nextOut = outPorts.map(convert);
        for (const sibling of current.inPorts.filter((port) => port.isSibling)) {
            if (!nextIn.some((port) => port.id === sibling.id)) nextIn.push(sibling.toInit());
        }
        for (const sibling of current.outPorts.filter((port) => port.isSibling)) {
            if (!nextOut.some((port) => port.id === sibling.id)) nextOut.push(sibling.toInit());
        }
        this.canvas.setNodePorts(nodeId, nextIn, nextOut);
    }

    updateNode(nodeId: string, patch: { name?: string; description?: string; color?: string; border?: string }): void {
        this.canvas.updateNode(nodeId, patch);
    }

    setNodeMessage(nodeId: string, message: string): void {
        this.canvas.updateNode(nodeId, { message });
    }

    setNodeError(nodeId: string, message: string, options: NodeErrorOptions = {}): boolean {
        return this.canvas.setNodeError(nodeId, message, options);
    }

    clearNodeError(nodeId: string, kind?: NodeErrorKind): boolean {
        return this.canvas.clearNodeError(nodeId, kind);
    }

    setNodeParamValue(nodeId: string, paramName: string, value: string | undefined): void {
        this.canvas.setNodeParamValue(nodeId, paramName, value);
    }

    setNodeName(nodeId: string, value: string): void {
        this.canvas.updateNode(nodeId, { name: value });
    }

    setShowNodeMessages(show: boolean): void {
        this.canvas.setShowNodeMessages(show);
    }

    setReadOnly(readonly: boolean): void {
        this.canvas.setReadOnly(readonly);
    }

    getInteractionPermissions(): DiagramInteractionPermissions {
        return this.canvas.getInteractionPermissions();
    }

    setInteractionPermissions(patch: Partial<DiagramInteractionPermissions>): void {
        this.canvas.setInteractionPermissions(patch);
    }

    applySocketTheme(): void {
        this.canvas.setTypeColors(this.portTypeColors());
    }

    applyOverviewTheme(): void {
        this.canvas.requestRedraw();
    }

    setOverviewVisible(visible: boolean): void {
        this.canvas.setOverviewVisible(visible);
        this.overviewContainer?.classList.toggle('hidden', !visible);
    }

    zoomToFit(): void {
        this.canvas.zoomToFit();
    }

    setZoom(scale: number): void {
        this.canvas.setZoom(scale);
    }

    getViewState(): DiagramViewState {
        return this.canvas.getViewState();
    }

    setViewState(state: DiagramViewState): void {
        this.canvas.setViewState(state);
        this.overviewContainer?.classList.toggle('hidden', !state.overviewVisible);
    }

    getSelection(): DiagramSelection {
        return this.canvas.getSelection();
    }

    selectNodes(nodeIds: readonly string[]): void {
        this.canvas.selectNodesById(nodeIds);
    }

    selectLink(linkId: string | null): void {
        this.canvas.selectLinkById(linkId);
    }

    selectPort(nodeId: string, direction: PortDirection, portId: string): void {
        this.canvas.selectPortById(nodeId, direction, portId);
    }

    resize(width: number, height: number): void {
        this.canvas.resize(width, height);
    }

    setTheme(options: DiagramThemeOptions): void {
        const {
            diagramBackground,
            overviewBackground,
            gridColor,
            linkMaxLightness,
            overviewBorderColor,
            overviewViewportColor,
            overviewViewportFill,
        } = options;
        if (diagramBackground !== undefined) {
            this.div.style.background = diagramBackground;
            if (this.div.parentElement !== null) this.div.parentElement.style.background = diagramBackground;
        }
        if (this.overviewContainer !== null && overviewBackground !== undefined) {
            this.overviewContainer.style.background = overviewBackground;
        }
        this.canvas.setTheme({
            background: diagramBackground,
            gridColor,
            linkMaxLightness,
            overviewBackground,
            overviewBorderColor,
            overviewViewportColor,
            overviewViewportFill,
        });
    }

    enableUndo(enabled: boolean): void { this.undoEnabled = enabled; }
    enableRedo(enabled: boolean): void { this.redoEnabled = enabled; }
    enableHelp(enabled: boolean): void { this.helpEnabled = enabled; }

    canUndo(): boolean { return this.undoEnabled && this.canvas.canUndo(); }
    canRedo(): boolean { return this.redoEnabled && this.canvas.canRedo(); }

    undo(): void {
        if (!this.canUndo()) return;
        this.canvas.undo();
        const snapshot = this.save();
        this.emit('undoRequested', snapshot);
    }

    redo(): void {
        if (!this.canRedo()) return;
        this.canvas.redo();
        const snapshot = this.save();
        this.emit('redoRequested', snapshot);
    }

    cutSelection(): void { this.canvas.cutSelection(); }
    copySelection(): void { this.canvas.copySelection(); }
    pasteSelection(): void { this.canvas.pasteSelection(); }

    clear(): void {
        this.loading = true;
        try {
            this.canvas.load([], []);
        } finally {
            this.loading = false;
        }
    }

    load(nodes: DiagramNode[], links: Link[], options: DiagramLoadOptions = {}): void {
        this.loading = true;
        try {
            this.canvas.load(nodes.map((node) => this.toCanvasNode(node)), links.map((link) => this.toCanvasLink(link)));
            for (const [nodeId, message] of Object.entries(options.nodeErrors ?? {})) {
                this.canvas.setNodeError(nodeId, message, { kind: 'load', animate: false });
            }
        } finally {
            this.loading = false;
        }
        const snapshot = this.save();
        this.emit('loadFinished', snapshot);
    }

    save(): { nodes: DiagramNode[]; links: Link[] } {
        const snapshot = this.canvas.save();
        return {
            nodes: snapshot.nodes.map((node) => this.fromCanvasInit(node)),
            links: snapshot.links.map((link) => this.fromCanvasLink(link)),
        };
    }

    loadDocument(document: DiagramDocument | string, options: DiagramLoadOptions = {}): void {
        this.loading = true;
        try {
            this.canvas.loadDocument(document);
            for (const [nodeId, message] of Object.entries(options.nodeErrors ?? {})) {
                this.canvas.setNodeError(nodeId, message, { kind: 'load', animate: false });
            }
        } finally {
            this.loading = false;
        }
        const saved = this.canvas.saveDocument();
        this.emit('documentLoaded', { document: saved });
        const snapshot = this.save();
        this.emit('loadFinished', snapshot);
    }

    saveDocument(): DiagramDocument {
        return this.canvas.saveDocument();
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        for (const dispose of this.disposables.splice(0).reverse()) dispose();
        this.canvas.destroy();
    }

    private bindCanvasEvents(): void {
        this.disposables.push(
            this.canvas.on('nodeAdded', ({ node }) => {
                if (!this.loading) this.emit('nodeAdded', { nodes: [this.fromCanvasNode(node)] });
            }),
            this.canvas.on('nodeRemoved', ({ node }) => {
                if (!this.loading) this.emit('nodeRemoved', { nodes: [this.fromCanvasNode(node)] });
            }),
            this.canvas.on('nodeMoved', ({ node }) => {
                if (!this.loading) this.emit('nodeMoved', { node: this.fromCanvasNode(node) });
            }),
            this.canvas.on('nodeChanged', ({ node }) => {
                if (!this.loading) this.emit('nodeEdit', { nodes: [this.fromCanvasNode(node)] });
            }),
            this.canvas.on('linkAdded', ({ link }) => {
                if (!this.loading) this.emit('linkAdded', { links: [this.fromCanvasLink(link)] });
            }),
            this.canvas.on('linkRemoved', ({ link }) => {
                if (!this.loading) this.emit('linkRemoved', { links: [this.fromCanvasLink(link)] });
            }),
            this.canvas.on('nodeSelected', ({ node, selected }) => {
                if (node !== null) this.emit('nodeSelected', { node: this.fromCanvasNode(node), selected });
            }),
            this.canvas.on('linkSelected', ({ link, selected }) => {
                if (link !== null) this.emit('linkSelected', { link: this.fromCanvasLink(link), selected });
            }),
            this.canvas.on('selectionChanged', (selection) => this.emit('selectionChanged', selection)),
            this.canvas.on('nodeHover', ({ node, hovering }) => {
                this.emit('nodeHover', { node: this.fromCanvasNode(node), hovering });
            }),
            this.canvas.on('portSelected', ({ node, port }) => {
                this.emit('portSelected', {
                    node: this.fromCanvasNode(node),
                    port: this.fromCanvasPort(port),
                    direction: port.direction,
                });
            }),
            this.canvas.on('portHover', ({ node, port, hovering }) => {
                this.emit('portHover', {
                    node: this.fromCanvasNode(node),
                    port: this.fromCanvasPort(port),
                    direction: port.direction,
                    hovering,
                });
            }),
            this.canvas.on('linkHover', ({ link, hovering }) => {
                this.emit('linkHover', { link: this.fromCanvasLink(link), hovering });
            }),
            this.canvas.on('linkValidation', ({ fromNode, from, toNode, to, allowed }) => {
                this.emit('linkValidation', {
                    fromNode: this.fromCanvasNode(fromNode),
                    fromPort: this.fromCanvasPort(from),
                    toNode: this.fromCanvasNode(toNode),
                    toPort: this.fromCanvasPort(to),
                    allowed,
                });
            }),
            this.canvas.on('nodeOpen', ({ node }) => {
                this.emit('nodeOpen', { nodes: [this.fromCanvasNode(node)] });
            }),
            this.canvas.on('zoomChanged', () => {
                this.updateZoomLabel();
                this.emit('zoomChanged', this.canvas.getViewState());
            }),
            this.canvas.on('undoStackChanged', (state) => this.emit('undoStackChanged', state)),
        );
    }

    private toCanvasNode(node: DiagramNode): CanvasNodeInit {
        return {
            id: node.id,
            typeId: node.typeId,
            name: node.name,
            description: node.description,
            groupName: node.groupName,
            color: node.color,
            border: node.border,
            icon: node.icon,
            openAction: node.openAction,
            message: node.message,
            isPlaceholder: node.isPlaceholder,
            parameters: node.parameters.map((parameter) => ({ ...parameter, options: [...parameter.options] })),
            paramValues: { ...node.paramValues },
            x: node.x,
            y: node.y,
            inPorts: node.inPorts.map((port) => this.toCanvasPort(port)),
            outPorts: node.outPorts.map((port) => this.toCanvasPort(port)),
        };
    }

    private fromCanvasNode(node: NodeModel): DiagramNode {
        return this.fromCanvasInit(node.toInit(false));
    }

    private fromCanvasInit(node: CanvasNodeInit & { id: string }): DiagramNode {
        return new DiagramNode({
            id: node.id,
            typeId: node.typeId,
            name: node.name,
            description: node.description,
            groupName: node.groupName,
            color: node.color,
            border: node.border,
            icon: node.icon,
            openAction: node.openAction,
            message: node.message,
            isPlaceholder: node.isPlaceholder,
            parameters: (node.parameters ?? []).map((parameter) => ({ ...parameter, options: [...parameter.options] })),
            paramValues: { ...(node.paramValues ?? {}) },
            x: node.x,
            y: node.y,
            inPorts: (node.inPorts ?? []).map((port) => this.fromCanvasPortInit(port)),
            outPorts: (node.outPorts ?? []).map((port) => this.fromCanvasPortInit(port)),
        });
    }

    private toCanvasPort(port: Port): CanvasPortInit {
        return {
            id: port.id,
            name: port.name,
            description: port.description,
            type: port.type,
            maxLinks: port.maxLinks,
            availableTypes: [...port.availableTypes],
            isDynamic: port.isDynamic,
            dynamicMode: port.dynamicMode,
            isSibling: port.isSibling,
        };
    }

    private fromCanvasPort(port: PortModel): Port {
        return this.fromCanvasPortInit(port.toInit());
    }

    private fromCanvasPortInit(port: CanvasPortInit): Port {
        return new Port({
            id: port.id,
            name: port.name,
            description: port.description,
            type: port.type,
            maxLinks: port.maxLinks,
            availableTypes: [...(port.availableTypes ?? [])],
            isDynamic: port.isDynamic,
            dynamicMode: port.dynamicMode,
            isSibling: port.isSibling,
        });
    }

    private toCanvasLink(link: Link): CanvasLinkInit {
        const idOf = (value: string | { id: string }): string => typeof value === 'string' ? value : value.id;
        return {
            from: idOf(link.outNode),
            fromPort: idOf(link.outPort),
            to: idOf(link.inNode),
            toPort: idOf(link.inPort),
        };
    }

    private fromCanvasLink(link: Pick<CanvasLinkInit, 'from' | 'fromPort' | 'to' | 'toPort'> | LinkModel): Link {
        return new Link({
            outNode: link.from,
            outPort: link.fromPort,
            inNode: link.to,
            inPort: link.toPort,
        });
    }

    private portTypeColors(): Record<string, string> {
        return Object.fromEntries(this.catalog.getPortTypes().map((portType) => [portType.name, portType.color]));
    }

    private updateZoomLabel(): void {
        if (this.zoomLabel !== null) this.zoomLabel.textContent = `${Math.round(this.canvas.getViewState().zoom * 100)}%`;
    }

    private generateNodeId(prefix: string): string {
        const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '') || 'node';
        let id: string;
        do id = `${safePrefix}_${this.idCounter++}`;
        while (this.canvas.findNode(id) !== undefined);
        return id;
    }
}
