import assert from 'node:assert/strict';
import test from 'node:test';

import { Diagram, version, type DiagramNodeInit } from '../src/ssgraph';

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

function installDom(): void {
    const fakeWindow = {
        devicePixelRatio: 1,
        addEventListener: () => undefined,
    };
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
}

function makeDiagram(): { diagram: Diagram; host: FakeHost } {
    installDom();
    const host = new FakeHost();
    const diagram = new Diagram({ host: host as unknown as HTMLElement });
    return { diagram, host };
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

test('destroy removes the owned canvas', () => {
    const { diagram, host } = makeDiagram();
    diagram.destroy();
    assert.equal(host.canvas?.removed, true);
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

test('complete StockSharpDiagram API loads through the repaired model bridge', async () => {
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
    const canvas = diagram.goDiagram.ss as unknown as { save(): { nodes: unknown[] } };
    assert.equal(canvas.save().nodes.length, 1);
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

    const ss = diagram.goDiagram.ss as unknown as {
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

    const canvas = diagram.goDiagram.ss as unknown as {
        findNode(id: string): { runtimeError: string } | undefined;
    };
    assert.equal(diagram.setNodeError('failed', 'Calculation failed.'), true);
    assert.equal(canvas.findNode('failed')?.runtimeError, 'Calculation failed.');
    assert.equal(diagram.clearNodeError('failed'), true);
    assert.equal(canvas.findNode('failed')?.runtimeError, '');
});
