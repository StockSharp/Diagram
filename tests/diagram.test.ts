import assert from 'node:assert/strict';
import test from 'node:test';

import { Diagram, version, type DiagramNodeInit } from '../src/ssgraph';
import { createDiagramDocument } from '../src/core/document';

class FakeCanvas {
    style: Record<string, string> = {};
    tabIndex = 0;
    width = 0;
    height = 0;
    removed = false;
    fillStyles: string[] = [];
    strokeStyles: string[] = [];
    drawnText: string[] = [];
    private readonly listeners = new Map<string, Array<EventListenerOrEventListenerObject>>();

    private readonly context = new Proxy({
        globalAlpha: 1,
        measureText: (text: string) => ({ width: text.length * 7 }),
        setTransform: () => undefined,
        fillText: (text: string) => { this.drawnText.push(text); },
    }, {
        get(target, property) {
            if (property in target) return target[property as keyof typeof target];
            return () => undefined;
        },
        set: (target, property, value) => {
            (target as Record<PropertyKey, unknown>)[property] = value;
            if (property === 'fillStyle' && typeof value === 'string')
                this.fillStyles.push(value);
            if (property === 'strokeStyle' && typeof value === 'string')
                this.strokeStyles.push(value);
            return true;
        },
    });

    getContext(): CanvasRenderingContext2D {
        return this.context as unknown as CanvasRenderingContext2D;
    }
    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
        const handlers = this.listeners.get(type) ?? [];
        handlers.push(listener);
        this.listeners.set(type, handlers);
    }
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
        const handlers = this.listeners.get(type);
        if (handlers === undefined) return;
        this.listeners.set(type, handlers.filter((handler) => handler !== listener));
    }
    listenerCount(): number {
        return [...this.listeners.values()].reduce((total, handlers) => total + handlers.length, 0);
    }
    dispatch(type: string, init: Record<string, unknown>): void {
        const event = { type, preventDefault: () => undefined, ...init } as unknown as Event;
        for (const listener of this.listeners.get(type) ?? []) {
            if (typeof listener === 'function') listener(event);
            else listener.handleEvent(event);
        }
    }
    getBoundingClientRect(): DOMRect {
        return { left: 0, top: 0, right: 800, bottom: 480, width: 800, height: 480, x: 0, y: 0, toJSON: () => ({}) };
    }
    setPointerCapture(): void {}
    focus(): void {}
    remove(): void { this.removed = true; }
}

class FakeHost {
    clientWidth = 800;
    clientHeight = 480;
    style: Record<string, string> = {};
    parentElement: FakeHost | null = null;
    canvas: FakeCanvas | null = null;
    classList = { toggle: () => false, add: () => undefined };
    appendChild(canvas: FakeCanvas): FakeCanvas {
        this.canvas = canvas;
        return canvas;
    }
    getBoundingClientRect(): DOMRect {
        return { left: 0, top: 0, right: 800, bottom: 480, width: 800, height: 480, x: 0, y: 0, toJSON: () => ({}) };
    }
}

class FakeWindow {
    devicePixelRatio = 1;
    private readonly listeners = new Map<string, EventListener[]>();

    addEventListener(type: string, listener: EventListener): void {
        const handlers = this.listeners.get(type) ?? [];
        handlers.push(listener);
        this.listeners.set(type, handlers);
    }
    removeEventListener(type: string, listener: EventListener): void {
        const handlers = this.listeners.get(type) ?? [];
        this.listeners.set(type, handlers.filter((handler) => handler !== listener));
    }
    listenerCount(): number {
        return [...this.listeners.values()].reduce((total, handlers) => total + handlers.length, 0);
    }
}

function installDom(): FakeWindow {
    const fakeWindow = new FakeWindow();
    const fakeDocument = {
        documentElement: {},
        createElement: (tag: string) => {
            assert.equal(tag, 'canvas');
            return new FakeCanvas();
        },
    };
    Object.assign(globalThis, {
        window: fakeWindow,
        document: fakeDocument,
        requestAnimationFrame: () => 1,
        Image: class {},
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
    });
    return fakeWindow;
}

function makeDiagram(): { diagram: Diagram; host: FakeHost; fakeWindow: FakeWindow } {
    const fakeWindow = installDom();
    const host = new FakeHost();
    const diagram = new Diagram({ host: host as unknown as HTMLElement });
    return { diagram, host, fakeWindow };
}

const source: DiagramNodeInit = {
    id: 'source',
    name: 'Source',
    x: 10,
    y: 20,
    outPorts: [{ id: 'out', name: 'Value', type: 'number' }],
};
const sink: DiagramNodeInit = {
    id: 'sink',
    name: 'Sink',
    x: 300,
    y: 20,
    inPorts: [{ id: 'in', name: 'Value', type: 'number' }],
};

test('exports a stable package version', () => {
    assert.equal(version, '0.1.0');
});

test('load/save preserves the public graph model', () => {
    const { diagram } = makeDiagram();
    diagram.load([source, sink], [
        { from: 'source', fromPort: 'out', to: 'sink', toPort: 'in' },
    ]);

    const saved = diagram.save();
    assert.equal(saved.nodes.length, 2);
    assert.deepEqual(saved.links, [
        { from: 'source', fromPort: 'out', to: 'sink', toPort: 'in' },
    ]);
    assert.equal(saved.nodes[0].outPorts[0].type, 'number');
});

test('canvas preserves the complete versioned document without runtime errors', () => {
    const { diagram } = makeDiagram();
    const document = createDiagramDocument({
        metadata: { strategy: 'designer' },
        nodes: [{
            id: 'source',
            name: 'Source',
            description: 'Full source description',
            icon: 'source.svg',
            message: 'Persistent note',
            outPorts: [{
                id: 'out',
                name: 'Value',
                description: 'Output value',
                type: 'number',
                maxLinks: 2,
                availableTypes: ['number', 'decimal'],
                isDynamic: true,
                dynamicMode: 'onConnect',
                metadata: { hostPortId: 7 },
            }],
            paramValues: { Value: '10' },
            metadata: { hostNodeId: 42 },
        }, {
            id: 'sink',
            name: 'Sink',
            inPorts: [{ id: 'in', name: 'Value', type: 'number' }],
        }],
        links: [{
            id: 'value-link',
            from: { nodeId: 'source', portId: 'out' },
            to: { nodeId: 'sink', portId: 'in' },
            metadata: { hostLinkId: 9 },
        }],
    });

    diagram.loadDocument(document);
    diagram.setNodeError('source', 'Transient failure', { kind: 'load' });

    assert.deepEqual(diagram.saveDocument(), document);
    assert.equal(diagram.save().nodes[0].loadError, undefined);
});

test('canvas clipboard preserves complete node data', () => {
    const { diagram } = makeDiagram();
    diagram.load([{
        ...source,
        description: 'Full description',
        metadata: { hostNodeId: 42 },
        outPorts: [{
            id: 'out',
            name: 'Value',
            description: 'Full port description',
            type: 'number',
            availableTypes: ['number', 'decimal'],
            metadata: { hostPortId: 7 },
        }],
        paramValues: { Period: '20' },
    }], []);
    diagram.selectNodeById('source');
    diagram.copySelection();
    diagram.pasteSelection();

    const pasted = diagram.saveDocument().nodes.find((node) => node.id !== 'source');
    assert.notEqual(pasted, undefined);
    assert.equal(pasted!.description, 'Full description');
    assert.deepEqual(pasted!.metadata, { hostNodeId: 42 });
    assert.deepEqual(pasted!.outPorts[0].availableTypes, ['number', 'decimal']);
    assert.deepEqual(pasted!.outPorts[0].metadata, { hostPortId: 7 });
    assert.deepEqual(pasted!.paramValues, { Period: '20' });
});

test('link validation rejects incompatible port types', () => {
    const { diagram } = makeDiagram();
    diagram.load([
        source,
        { ...sink, inPorts: [{ id: 'in', name: 'Orders', type: 'order' }] },
    ], []);
    diagram.setLinkValidator(({ fromPort, toPort }) => fromPort.type === toPort.type);

    const added = diagram.addLink({ from: 'source', fromPort: 'out', to: 'sink', toPort: 'in' });

    assert.equal(added, false);
    assert.deepEqual(diagram.save().links, []);
});

test('mutations participate in undo and redo', () => {
    const { diagram } = makeDiagram();
    diagram.load([source], []);
    const events: Array<{ canUndo: boolean; canRedo: boolean }> = [];
    diagram.on('undoStackChanged', (event) => events.push(event));

    diagram.addDiagramNode(sink);
    assert.equal(diagram.save().nodes.length, 2);
    assert.equal(diagram.canUndo(), true);

    diagram.undo();
    assert.deepEqual(diagram.save().nodes.map((node) => node.id), ['source']);
    assert.equal(diagram.canRedo(), true);

    diagram.redo();
    assert.deepEqual(diagram.save().nodes.map((node) => node.id), ['source', 'sink']);
    assert.ok(events.length >= 3);
});

test('port removal and cascaded links are one reversible transaction', () => {
    const { diagram } = makeDiagram();
    diagram.load([source, sink], [
        { id: 'value-link', from: 'source', fromPort: 'out', to: 'sink', toPort: 'in' },
    ]);

    assert.equal(diagram.removePort('sink', 'in', 'in'), true);
    assert.equal(diagram.saveDocument().nodes[1].inPorts.length, 0);
    assert.equal(diagram.saveDocument().links.length, 0);

    diagram.undo();
    assert.equal(diagram.saveDocument().nodes[1].inPorts[0].id, 'in');
    assert.equal(diagram.saveDocument().links[0].id, 'value-link');

    diagram.redo();
    assert.equal(diagram.saveDocument().nodes[1].inPorts.length, 0);
    assert.equal(diagram.saveDocument().links.length, 0);
});

test('selection snapshot supports multiple nodes, ports and stable link ids', () => {
    const { diagram } = makeDiagram();
    diagram.load([source, sink], [{
        id: 'value-link',
        from: 'source',
        fromPort: 'out',
        to: 'sink',
        toPort: 'in',
    }]);
    const snapshots: ReturnType<Diagram['getSelection']>[] = [];
    diagram.on('selectionChanged', (selection) => snapshots.push(selection));

    diagram.selectNodesById(['source', 'sink']);
    assert.deepEqual(diagram.getSelection().nodeIds, ['source', 'sink']);
    assert.equal(diagram.getSelection().primaryNodeId, 'sink');

    diagram.selectPortById('source', 'out', 'out');
    assert.deepEqual(diagram.getSelection().port, {
        nodeId: 'source',
        portId: 'out',
        direction: 'out',
    });

    diagram.selectLinkById('value-link');
    assert.deepEqual(diagram.getSelection().nodeIds, []);
    assert.deepEqual(diagram.getSelection().linkIds, ['value-link']);
    assert.equal(diagram.getSelection().port, null);
    assert.ok(snapshots.length >= 3);
});

test('read-only mode keeps inspection, selection and copy without allowing edits', () => {
    const { diagram, host } = makeDiagram();
    diagram.load([{ ...source, openAction: 'open' }], []);
    diagram.moveNode('source', 20, 30);
    diagram.setReadOnly(true);
    const node = diagram.findNode('source')!;
    const [x, y] = (diagram as unknown as { toScreen(x: number, y: number): [number, number] })
        .toScreen(node.x + node.w / 2, node.y + node.h / 2);
    let contexts = 0;
    let opened = 0;
    diagram.on('contextMenu', () => { contexts += 1; });
    diagram.on('nodeOpen', () => { opened += 1; });

    host.canvas!.dispatch('pointerdown', {
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        clientX: x,
        clientY: y,
    });
    host.canvas!.dispatch('pointermove', { clientX: x + 100, clientY: y + 100 });
    host.canvas!.dispatch('contextmenu', { clientX: x, clientY: y });
    host.canvas!.dispatch('dblclick', { clientX: x, clientY: y });

    assert.deepEqual(diagram.getSelection().nodeIds, ['source']);
    assert.equal(diagram.findNode('source')?.x, 20);
    assert.equal(diagram.findNode('source')?.y, 30);
    assert.equal(contexts, 1);
    assert.equal(opened, 1);
    assert.equal(diagram.canUndo(), false);

    diagram.copySelection();
    diagram.pasteSelection();
    assert.equal(diagram.save().nodes.length, 1);
    diagram.setReadOnly(false);
    diagram.pasteSelection();
    assert.equal(diagram.save().nodes.length, 2);
});

test('destroy removes the owned canvas', () => {
    const { diagram, host, fakeWindow } = makeDiagram();
    assert.ok((host.canvas?.listenerCount() ?? 0) > 0);
    assert.ok(fakeWindow.listenerCount() > 0);
    diagram.destroy();
    diagram.destroy();
    assert.equal(host.canvas?.removed, true);
    assert.equal(host.canvas?.listenerCount(), 0);
    assert.equal(fakeWindow.listenerCount(), 0);
});

test('overview derives a light palette from the canvas theme', () => {
    const { diagram, host } = makeDiagram();
    diagram.load([source, sink], []);
    diagram.setTheme({ background: '#f5f7fa', gridColor: '#e2e8f0' });

    (diagram as unknown as { drawOverview(): void }).drawOverview();

    assert.ok(host.canvas?.fillStyles.includes('rgba(255,255,255,0.94)'));
    assert.ok(host.canvas?.fillStyles.includes('rgba(217,119,6,0.10)'));
});

test('double-click is emitted only for nodes with an open action', () => {
    const { diagram, host } = makeDiagram();
    diagram.load([
        { ...source, id: 'open', openAction: 'indicatorSettings' },
        { ...sink, id: 'plain' },
    ], []);
    const opened: string[] = [];
    diagram.on('nodeOpen', ({ node }) => opened.push(node.id));

    const internals = diagram as unknown as {
        findNode(id: string): { x: number; y: number; w: number; h: number } | undefined;
        toScreen(x: number, y: number): [number, number];
    };
    const open = internals.findNode('open')!;
    const [openX, openY] = internals.toScreen(open.x + open.w / 2, open.y + open.h / 2);
    host.canvas!.dispatch('dblclick', { clientX: openX, clientY: openY });

    const plain = internals.findNode('plain')!;
    const [plainX, plainY] = internals.toScreen(plain.x + plain.w / 2, plain.y + plain.h / 2);
    host.canvas!.dispatch('dblclick', { clientX: plainX, clientY: plainY });

    assert.deepEqual(opened, ['open']);
});

test('runtime errors flash the border and expose tooltip text', () => {
    const { diagram, host } = makeDiagram();
    diagram.load([{ ...source, id: 'failed' }], []);
    const node = diagram.findNode('failed')!;

    assert.equal(diagram.setNodeError('failed', 'Calculation failed.'), true);
    assert.equal(node.runtimeError, 'Calculation failed.');
    assert.notEqual(node.errorFlashStart, null);

    node.errorFlashStart = performance.now() - 2000;
    const internals = diagram as unknown as {
        draw(): void;
        drawTooltip(): void;
        hoverNode: typeof node;
        tipShow: boolean;
        cursor: { x: number; y: number };
    };
    internals.draw();
    assert.equal(node.errorFlashStart, null);
    assert.ok(host.canvas!.strokeStyles.includes('#f6465d'));

    internals.hoverNode = node;
    internals.tipShow = true;
    internals.cursor = { x: 20, y: 20 };
    internals.drawTooltip();
    assert.ok(host.canvas!.drawnText.includes('Calculation failed.'));

    assert.equal(diagram.clearNodeError('failed'), true);
    assert.equal(node.runtimeError, '');
});

test('load errors use a red background and expose tooltip text', () => {
    const { diagram, host } = makeDiagram();
    diagram.load([{ ...source, id: 'damaged', loadError: 'Saved scheme is damaged.' }], []);
    const node = diagram.findNode('damaged')!;

    assert.equal(node.loadError, 'Saved scheme is damaged.');
    const internals = diagram as unknown as {
        draw(): void;
        drawTooltip(): void;
        hoverNode: typeof node;
        tipShow: boolean;
        cursor: { x: number; y: number };
    };
    internals.draw();
    assert.ok(host.canvas!.fillStyles.includes('#7d2632'));
    assert.ok(host.canvas!.strokeStyles.includes('#f6465d'));

    internals.hoverNode = node;
    internals.tipShow = true;
    internals.cursor = { x: 20, y: 20 };
    internals.drawTooltip();
    assert.ok(host.canvas!.drawnText.includes('Saved scheme is damaged.'));

    assert.equal(diagram.clearNodeError('damaged', 'load'), true);
    assert.equal(node.loadError, '');
});

test('public package entry does not install the legacy window.go runtime', async () => {
    installDom();
    await import('../src/index');
    assert.equal((globalThis.window as unknown as { go?: unknown }).go, undefined);
});

test('legacy adapter publishes window.go and exposes a working selection count', async () => {
    installDom();
    const { default: go } = await import('../src/ssdiagram');
    assert.equal((globalThis.window as unknown as { go: unknown }).go, go);

    const host = new FakeHost();
    const legacy = new go.Diagram(host as unknown as HTMLElement, {});
    legacy.model.addNodeData({
        id: 'legacy',
        name: 'Legacy node',
        inPorts: [],
        outPorts: [],
    });
    const node = legacy.findNodeForKey('legacy');
    assert.notEqual(node, null);
    legacy.select(node!);
    assert.equal(legacy.selection.count, 1);
});

test('complete StockSharpDiagram API loads through the direct canvas facade', async () => {
    installDom();
    const {
        DiagramNode,
        Node,
        StockSharpCatalog,
        StockSharpDiagram,
    } = await import('../src/index');

    const catalog = new StockSharpCatalog();
    catalog.addNodeType(new Node({
        id: 'source-type',
        name: 'Source',
        outPorts: [{ id: 'value', name: 'Value', type: 'Decimal' }],
    }));

    const host = new FakeHost();
    const diagram = new StockSharpDiagram({
        div: host as unknown as HTMLElement,
        catalog,
    });
    diagram.load([
        new DiagramNode({
            id: 'high-level',
            typeId: 'source-type',
            name: 'High-level source',
            outPorts: [{ id: 'value', name: 'Value', type: 'Decimal' }],
            x: 25,
            y: 40,
        }),
    ], []);

    assert.equal(diagram.save().nodes[0].name, 'High-level source');
    const canvas = diagram.renderer;
    assert.equal(canvas.save().nodes.length, 1);
});

test('high-level move and zoom methods update the real canvas state', async () => {
    installDom();
    const {
        DiagramNode,
        StockSharpCatalog,
        StockSharpDiagram,
    } = await import('../src/index');
    const host = new FakeHost();
    const diagram = new StockSharpDiagram({
        div: host as unknown as HTMLElement,
        catalog: new StockSharpCatalog(),
    });
    diagram.load([new DiagramNode({ id: 'node', name: 'Node', x: 10, y: 20 })], []);

    diagram.moveNode('node', 150, -25);
    diagram.setZoom(1.75);

    assert.equal(diagram.renderer.findNode('node')?.x, 150);
    assert.equal(diagram.renderer.findNode('node')?.y, -25);
    assert.equal(diagram.getViewState().zoom, 1.75);
    assert.equal(diagram.save().nodes[0].x, 150);
});

test('high-level persistent edits use canvas history without capturing runtime errors', async () => {
    installDom();
    const {
        DiagramNode,
        StockSharpCatalog,
        StockSharpDiagram,
    } = await import('../src/index');
    const host = new FakeHost();
    const diagram = new StockSharpDiagram({
        div: host as unknown as HTMLElement,
        catalog: new StockSharpCatalog(),
    });
    diagram.load([new DiagramNode({ id: 'node', name: 'Node' })], []);
    diagram.setNodeError('node', 'Runtime failure');

    diagram.setNodeParamValue('node', 'Period', '20');
    assert.equal(diagram.canUndo(), true);
    assert.deepEqual(diagram.save().nodes[0].paramValues, { Period: '20' });

    diagram.undo();
    assert.deepEqual(diagram.save().nodes[0].paramValues, {});
    assert.equal(diagram.renderer.findNode('node')?.runtimeError, 'Runtime failure');

    diagram.redo();
    assert.deepEqual(diagram.save().nodes[0].paramValues, { Period: '20' });
    assert.equal(diagram.renderer.findNode('node')?.runtimeError, 'Runtime failure');
});

test('high-level versioned document API preserves host metadata', async () => {
    installDom();
    const {
        StockSharpCatalog,
        StockSharpDiagram,
        createDiagramDocument,
    } = await import('../src/index');
    const host = new FakeHost();
    const diagram = new StockSharpDiagram({
        div: host as unknown as HTMLElement,
        catalog: new StockSharpCatalog(),
    });
    const document = createDiagramDocument({
        metadata: { owner: 'Designer' },
        nodes: [{
            id: 'node',
            name: 'Node',
            outPorts: [{ id: 'out', name: 'Out', metadata: { socket: 1 } }],
            metadata: { element: 2 },
        }],
    });

    diagram.loadDocument(document);

    assert.deepEqual(diagram.saveDocument(), document);
});

test('high-level host receives opt-in nodeOpen', async () => {
    installDom();
    const {
        DiagramNode,
        Node,
        StockSharpCatalog,
        StockSharpDiagram,
    } = await import('../src/index');

    const catalog = new StockSharpCatalog();
    catalog.addNodeType(new Node({
        id: 'indicator',
        name: 'Indicator',
        openAction: 'indicatorSettings',
    }));
    const host = new FakeHost();
    const diagram = new StockSharpDiagram({ div: host as unknown as HTMLElement, catalog });
    diagram.load([new DiagramNode({
        id: 'indicator-1',
        typeId: 'indicator',
        name: 'SMA (20)',
        openAction: 'indicatorSettings',
        x: 50,
        y: 50,
    })], []);

    const ss = diagram.renderer as unknown as {
        findNode(id: string): { id: string; x: number; y: number; w: number; h: number } | undefined;
        toScreen(x: number, y: number): [number, number];
    };
    const node = ss.findNode('indicator-1')!;

    const opened: string[] = [];
    diagram.on('nodeOpen', ({ nodes }) => opened.push(nodes[0].openAction));
    const [hitX, hitY] = ss.toScreen(node.x + node.w / 2, node.y + node.h / 2);
    host.canvas!.dispatch('dblclick', { clientX: hitX, clientY: hitY });
    assert.deepEqual(opened, ['indicatorSettings']);
});

test('high-level host can apply and clear runtime node errors', async () => {
    installDom();
    const {
        DiagramNode,
        StockSharpCatalog,
        StockSharpDiagram,
    } = await import('../src/index');

    const host = new FakeHost();
    const diagram = new StockSharpDiagram({
        div: host as unknown as HTMLElement,
        catalog: new StockSharpCatalog(),
    });
    diagram.load([new DiagramNode({
        id: 'failed',
        name: 'Order Builder',
        x: 50,
        y: 50,
    })], []);

    const canvas = diagram.renderer as unknown as {
        findNode(id: string): { runtimeError: string } | undefined;
    };
    assert.equal(diagram.setNodeError('failed', 'Calculation failed.'), true);
    assert.equal(canvas.findNode('failed')?.runtimeError, 'Calculation failed.');
    assert.equal(diagram.clearNodeError('failed'), true);
    assert.equal(canvas.findNode('failed')?.runtimeError, '');
});

test('high-level load errors remain transient', async () => {
    installDom();
    const {
        DiagramNode,
        StockSharpCatalog,
        StockSharpDiagram,
    } = await import('../src/index');

    const host = new FakeHost();
    const diagram = new StockSharpDiagram({
        div: host as unknown as HTMLElement,
        catalog: new StockSharpCatalog(),
    });
    diagram.load([new DiagramNode({
        id: 'damaged',
        name: 'Slow SMA',
        x: 50,
        y: 50,
    })], [], {
        nodeErrors: { damaged: 'Period could not be restored.' },
    });

    const canvas = diagram.renderer as unknown as {
        findNode(id: string): { loadError: string } | undefined;
    };
    assert.equal(canvas.findNode('damaged')?.loadError, 'Period could not be restored.');
    assert.equal(diagram.save().nodes[0].message, '');
});

test('high-level load/save preserves the complete Designer node contract', async () => {
    installDom();
    const {
        DiagramNode,
        Link,
        StockSharpCatalog,
        StockSharpDiagram,
    } = await import('../src/index');

    const host = new FakeHost();
    const diagram = new StockSharpDiagram({
        div: host as unknown as HTMLElement,
        catalog: new StockSharpCatalog(),
    });
    const node = new DiagramNode({
        id: 'indicator-1',
        typeId: 'indicator',
        name: 'SMA (20)',
        description: 'Simple moving average',
        groupName: 'Indicators',
        icon: 'data:image/svg+xml;base64,PHN2Zy8+',
        openAction: 'indicatorSettings',
        color: '#102030',
        border: '#405060',
        x: 125.5,
        y: -42.25,
        inPorts: [{
            id: 'source',
            name: 'Source',
            description: 'Input values',
            type: 'Decimal',
            maxLinks: 1,
            availableTypes: ['Decimal', 'Double'],
            isDynamic: true,
            dynamicMode: 'onConnect',
            isSibling: true,
        }],
        outPorts: [{
            id: 'result',
            name: 'Result',
            description: 'Calculated value',
            type: 'Decimal',
            maxLinks: 2,
        }],
        parameters: [{
            name: 'Period',
            displayName: 'Period',
            description: 'Number of values',
            type: 'number',
            defaultValue: '20',
            options: ['10', '20', '50'],
            min: 1,
            max: 1000,
            displayOrder: 10,
            category: 'General',
            isBasic: true,
            editorType: 'Int32Editor',
        }],
        paramValues: { Period: '34' },
    });

    diagram.load([node], [new Link({
        outNode: 'indicator-1',
        outPort: 'result',
        inNode: 'indicator-1',
        inPort: 'source',
    })]);

    const saved = diagram.save();
    assert.equal(saved.nodes.length, 1);
    assert.deepEqual(saved.nodes[0], node);
    assert.deepEqual(saved.links[0], new Link({
        outNode: 'indicator-1',
        outPort: 'result',
        inNode: 'indicator-1',
        inPort: 'source',
    }));
});
