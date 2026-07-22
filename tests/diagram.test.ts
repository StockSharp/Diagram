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
    drawImageCount = 0;
    transforms: number[][] = [];
    private readonly listeners = new Map<string, Array<EventListenerOrEventListenerObject>>();

    private readonly context = new Proxy({
        globalAlpha: 1,
        measureText: (text: string) => ({ width: text.length * 7 }),
        setTransform: (...values: number[]) => { this.transforms.push(values); },
        drawImage: () => { this.drawImageCount += 1; },
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

class FakeButton {
    style: Record<string, string> = {};
    hidden = false;
    removed = false;
    type = '';
    className = '';
    title = '';
    innerHTML = '';
    private readonly attributes = new Map<string, string>();
    private readonly listeners = new Map<string, Array<EventListenerOrEventListenerObject>>();

    setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
    getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
        const handlers = this.listeners.get(type) ?? [];
        handlers.push(listener);
        this.listeners.set(type, handlers);
    }
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
        this.listeners.set(type, (this.listeners.get(type) ?? []).filter((handler) => handler !== listener));
    }
    remove(): void { this.removed = true; }
}

class FakeHost {
    clientWidth = 800;
    clientHeight = 480;
    style: Record<string, string> = {};
    parentElement: FakeHost | null = null;
    canvas: FakeCanvas | null = null;
    button: FakeButton | null = null;
    classList = { toggle: () => false, add: () => undefined };
    appendChild<T extends FakeCanvas | FakeButton>(child: T): T {
        if (child instanceof FakeCanvas) this.canvas = child;
        else this.button = child;
        return child;
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
    dispatch(type: string, init: Record<string, unknown>): void {
        const event = { type, preventDefault: () => undefined, ...init } as unknown as Event;
        for (const listener of this.listeners.get(type) ?? []) listener(event);
    }
}

function installDom(): FakeWindow {
    const fakeWindow = new FakeWindow();
    const fakeDocument = {
        documentElement: {},
        createElement: (tag: string) => {
            if (tag === 'canvas') return new FakeCanvas();
            if (tag === 'button') return new FakeButton();
            throw new Error(`Unexpected element: ${tag}`);
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

test('link validation reports compatibility, duplicates and limits on both ends', () => {
    const { diagram } = makeDiagram();
    diagram.load([{
        id: 'source-a',
        name: 'Source A',
        outPorts: [{ id: 'out', name: 'Out', type: 'Decimal', maxLinks: 1 }],
    }, {
        id: 'source-b',
        name: 'Source B',
        outPorts: [{ id: 'out', name: 'Out', type: 'Decimal' }],
    }, {
        id: 'sink-a',
        name: 'Sink A',
        inPorts: [{ id: 'in', name: 'In', type: 'Number', availableTypes: ['Decimal'], maxLinks: 1 }],
    }, {
        id: 'sink-b',
        name: 'Sink B',
        inPorts: [{ id: 'in', name: 'In', type: 'Decimal' }],
    }], []);

    const first = { from: 'source-a', fromPort: 'out', to: 'sink-a', toPort: 'in' };
    assert.deepEqual(diagram.validateLink(first), { allowed: true, reason: 'allowed' });
    assert.equal(diagram.addLink(first), true);
    assert.deepEqual(diagram.validateLink(first), { allowed: false, reason: 'duplicate-link' });
    assert.deepEqual(diagram.validateLink({
        from: 'source-a', fromPort: 'out', to: 'sink-b', toPort: 'in',
    }), { allowed: false, reason: 'source-limit' });
    assert.deepEqual(diagram.validateLink({
        from: 'source-b', fromPort: 'out', to: 'sink-a', toPort: 'in',
    }), { allowed: false, reason: 'target-limit' });

    diagram.setLinkValidator(() => false);
    assert.deepEqual(diagram.validateLink({
        from: 'source-b', fromPort: 'out', to: 'sink-b', toPort: 'in',
    }), { allowed: false, reason: 'host-rejected' });
});

test('port limits independently control fan-in and fan-out and can change at runtime', () => {
    const { diagram } = makeDiagram();
    diagram.load([{
        id: 'source-a', name: 'Source A',
        outPorts: [{ id: 'out', name: 'Out', type: 'Decimal', maxLinks: 1 }],
    }, {
        id: 'source-b', name: 'Source B',
        outPorts: [{ id: 'out', name: 'Out', type: 'Decimal' }],
    }, {
        id: 'source-c', name: 'Source C',
        outPorts: [{ id: 'out', name: 'Out', type: 'Decimal' }],
    }, {
        id: 'sink-a', name: 'Sink A',
        inPorts: [{ id: 'in', name: 'In', type: 'Decimal', maxLinks: 1 }],
    }, {
        id: 'sink-b', name: 'Sink B',
        inPorts: [{ id: 'in', name: 'In', type: 'Decimal' }],
    }, {
        id: 'sink-c', name: 'Sink C',
        inPorts: [{ id: 'in', name: 'In', type: 'Decimal' }],
    }], []);

    const first = { from: 'source-a', fromPort: 'out', to: 'sink-a', toPort: 'in' };
    assert.equal(diagram.addLink(first), true);
    assert.deepEqual(diagram.validateLink({
        from: 'source-a', fromPort: 'out', to: 'sink-b', toPort: 'in',
    }), { allowed: false, reason: 'source-limit' });
    assert.deepEqual(diagram.validateLink({
        from: 'source-b', fromPort: 'out', to: 'sink-a', toPort: 'in',
    }), { allowed: false, reason: 'target-limit' });

    assert.equal(diagram.updatePort('source-a', 'out', 'out', { maxLinks: 0 }), true);
    assert.equal(diagram.updatePort('sink-a', 'in', 'in', { maxLinks: 0 }), true);
    assert.equal(diagram.addLink({
        from: 'source-a', fromPort: 'out', to: 'sink-b', toPort: 'in',
    }), true);
    assert.equal(diagram.addLink({
        from: 'source-b', fromPort: 'out', to: 'sink-a', toPort: 'in',
    }), true);
    assert.deepEqual(diagram.validateLink(first), { allowed: false, reason: 'duplicate-link' });

    assert.equal(diagram.updatePort('source-a', 'out', 'out', { maxLinks: 1 }), true);
    assert.equal(diagram.updatePort('sink-a', 'in', 'in', { maxLinks: 1 }), true);
    assert.equal(diagram.saveDocument().links.length, 3, 'lower limits must not delete existing links');
    assert.deepEqual(diagram.validateLink({
        from: 'source-c', fromPort: 'out', to: 'sink-a', toPort: 'in',
    }), { allowed: false, reason: 'target-limit' });
    assert.deepEqual(diagram.validateLink({
        from: 'source-a', fromPort: 'out', to: 'sink-c', toPort: 'in',
    }), { allowed: false, reason: 'source-limit' });

    diagram.undo();
    assert.deepEqual(diagram.validateLink({
        from: 'source-c', fromPort: 'out', to: 'sink-a', toPort: 'in',
    }), { allowed: true, reason: 'allowed' });
    diagram.undo();
    assert.deepEqual(diagram.validateLink({
        from: 'source-a', fromPort: 'out', to: 'sink-c', toPort: 'in',
    }), { allowed: true, reason: 'allowed' });
});

test('Any and Object ports accept every socket type', () => {
    const { diagram } = makeDiagram();
    diagram.load([{
        id: 'decimal', name: 'Decimal source',
        outPorts: [{ id: 'out', name: 'Out', type: 'Decimal' }],
    }, {
        id: 'any', name: 'Any source',
        outPorts: [{ id: 'out', name: 'Out', type: 'Any' }],
    }, {
        id: 'object', name: 'Object sink',
        inPorts: [{ id: 'in', name: 'In', type: 'Object' }],
    }, {
        id: 'candle', name: 'Candle sink',
        inPorts: [{ id: 'in', name: 'In', type: 'Candle' }],
    }, {
        id: 'available-object', name: 'Wildcard whitelist sink',
        inPorts: [{ id: 'in', name: 'In', type: 'Candle', availableTypes: ['System.Object'] }],
    }], []);

    assert.deepEqual(diagram.validateLink({
        from: 'decimal', fromPort: 'out', to: 'object', toPort: 'in',
    }), { allowed: true, reason: 'allowed' });
    assert.deepEqual(diagram.validateLink({
        from: 'any', fromPort: 'out', to: 'candle', toPort: 'in',
    }), { allowed: true, reason: 'allowed' });
    assert.deepEqual(diagram.validateLink({
        from: 'decimal', fromPort: 'out', to: 'available-object', toPort: 'in',
    }), { allowed: true, reason: 'allowed' });
    assert.deepEqual(diagram.validateLink({
        from: 'decimal', fromPort: 'out', to: 'candle', toPort: 'in',
    }), { allowed: false, reason: 'incompatible-type' });
});

test('changing a port type removes only incompatible links as one undoable edit', () => {
    const { diagram } = makeDiagram();
    diagram.load([{
        id: 'decimal', name: 'Decimal source',
        outPorts: [{ id: 'out', name: 'Out', type: 'Decimal' }],
    }, {
        id: 'candle', name: 'Candle source',
        outPorts: [{ id: 'out', name: 'Out', type: 'Candle' }],
    }, {
        id: 'sink', name: 'Object sink',
        inPorts: [{ id: 'in', name: 'In', type: 'Object' }],
    }], []);
    assert.equal(diagram.addLink({ from: 'decimal', fromPort: 'out', to: 'sink', toPort: 'in' }), true);
    assert.equal(diagram.addLink({ from: 'candle', fromPort: 'out', to: 'sink', toPort: 'in' }), true);

    assert.equal(diagram.updatePort('sink', 'in', 'in', { type: 'Decimal' }), true);
    assert.equal(diagram.findNode('sink')?.inPorts[0]?.type, 'Decimal');
    assert.deepEqual(diagram.saveDocument().links.map((link) => link.from.nodeId), ['decimal']);

    diagram.undo();
    assert.equal(diagram.findNode('sink')?.inPorts[0]?.type, 'Object');
    assert.deepEqual(diagram.saveDocument().links.map((link) => link.from.nodeId), ['decimal', 'candle']);

    diagram.redo();
    assert.equal(diagram.findNode('sink')?.inPorts[0]?.type, 'Decimal');
    assert.deepEqual(diagram.saveDocument().links.map((link) => link.from.nodeId), ['decimal']);
});

test('replacing a node port schema removes links that no longer match its types', () => {
    const { diagram } = makeDiagram();
    diagram.load([{
        id: 'source', name: 'Decimal source',
        outPorts: [{ id: 'out', name: 'Out', type: 'Decimal' }],
    }, {
        id: 'sink', name: 'Object sink',
        inPorts: [{ id: 'in', name: 'In', type: 'Object' }],
    }], [{ from: 'source', fromPort: 'out', to: 'sink', toPort: 'in' }]);

    assert.equal(diagram.setNodePorts('sink', [{ id: 'in', name: 'In', type: 'Candle' }], []), true);
    assert.equal(diagram.saveDocument().links.length, 0);

    diagram.undo();
    assert.equal(diagram.findNode('sink')?.inPorts[0]?.type, 'Object');
    assert.equal(diagram.saveDocument().links.length, 1);
});

test('relink preserves identity and metadata and is one reversible action', () => {
    const { diagram } = makeDiagram();
    diagram.load([{
        id: 'source', name: 'Source', outPorts: [{ id: 'out', name: 'Out', type: 'number' }],
    }, {
        id: 'sink-a', name: 'Sink A', inPorts: [{ id: 'in', name: 'In', type: 'number' }],
    }, {
        id: 'sink-b', name: 'Sink B', inPorts: [{ id: 'in', name: 'In', type: 'number' }],
    }], [{
        id: 'stable-link',
        from: 'source', fromPort: 'out', to: 'sink-a', toPort: 'in',
        metadata: { hostLinkId: 42 },
    }]);
    const events: string[] = [];
    diagram.on('linkRelinked', ({ link, previous }) => events.push(`${previous.to}->${link.to}`));

    assert.deepEqual(diagram.relink('stable-link', {
        from: 'source', fromPort: 'out', to: 'sink-b', toPort: 'in',
    }), { allowed: true, reason: 'allowed' });
    let link = diagram.saveDocument().links[0];
    assert.equal(link.id, 'stable-link');
    assert.equal(link.to.nodeId, 'sink-b');
    assert.deepEqual(link.metadata, { hostLinkId: 42 });

    diagram.undo();
    link = diagram.saveDocument().links[0];
    assert.equal(link.to.nodeId, 'sink-a');
    diagram.redo();
    assert.equal(diagram.saveDocument().links[0].to.nodeId, 'sink-b');
    assert.deepEqual(events, ['sink-a->sink-b', 'sink-b->sink-a', 'sink-a->sink-b']);

    assert.deepEqual(diagram.relink('stable-link', {
        from: 'source', fromPort: 'missing', to: 'sink-a', toPort: 'in',
    }), { allowed: false, reason: 'missing-port' });
    assert.equal(diagram.saveDocument().links[0].to.nodeId, 'sink-b');
    assert.deepEqual(diagram.relink('unknown', {
        from: 'source', fromPort: 'out', to: 'sink-a', toPort: 'in',
    }), { allowed: false, reason: 'missing-link' });
});

test('selected link endpoint can be dragged to another compatible port', () => {
    const { diagram, host, fakeWindow } = makeDiagram();
    diagram.load([{
        id: 'source', name: 'Source', x: 20, y: 50,
        outPorts: [{ id: 'out', name: 'Out', type: 'number' }],
    }, {
        id: 'source-b', name: 'Source B', x: 20, y: 210,
        outPorts: [{ id: 'out', name: 'Out', type: 'number' }],
    }, {
        id: 'sink-a', name: 'Sink A', x: 300, y: 20,
        inPorts: [{ id: 'in', name: 'In', type: 'number' }],
    }, {
        id: 'sink-b', name: 'Sink B', x: 300, y: 180,
        inPorts: [{ id: 'in', name: 'In', type: 'number' }],
    }], [{ id: 'stable-link', from: 'source', fromPort: 'out', to: 'sink-a', toPort: 'in' }]);
    diagram.selectLinkById('stable-link');

    const renderer = diagram as unknown as {
        findNode(id: string): {
            inPorts: Array<{ cx: number; cy: number }>;
            outPorts: Array<{ cx: number; cy: number }>;
        } | undefined;
        toScreen(x: number, y: number): [number, number];
    };
    const oldPort = renderer.findNode('sink-a')!.inPorts[0];
    const newPort = renderer.findNode('sink-b')!.inPorts[0];
    const [oldX, oldY] = renderer.toScreen(oldPort.cx, oldPort.cy);
    const [newX, newY] = renderer.toScreen(newPort.cx, newPort.cy);
    host.canvas!.dispatch('pointerdown', {
        clientX: oldX, clientY: oldY, pointerId: 1, pointerType: 'mouse', button: 0,
        shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
    });
    host.canvas!.dispatch('pointermove', { clientX: newX, clientY: newY });
    fakeWindow.dispatch('pointerup', { clientX: newX, clientY: newY, shiftKey: false });

    assert.equal(diagram.saveDocument().links[0].to.nodeId, 'sink-b');
    diagram.undo();
    assert.equal(diagram.saveDocument().links[0].to.nodeId, 'sink-a');

    const oldSource = renderer.findNode('source')!.outPorts[0];
    const newSource = renderer.findNode('source-b')!.outPorts[0];
    const [oldSourceX, oldSourceY] = renderer.toScreen(oldSource.cx, oldSource.cy);
    const [newSourceX, newSourceY] = renderer.toScreen(newSource.cx, newSource.cy);
    host.canvas!.dispatch('pointerdown', {
        clientX: oldSourceX, clientY: oldSourceY, pointerId: 2, pointerType: 'mouse', button: 0,
        shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
    });
    host.canvas!.dispatch('pointermove', { clientX: newSourceX, clientY: newSourceY });
    fakeWindow.dispatch('pointerup', { clientX: newSourceX, clientY: newSourceY, shiftKey: false });
    assert.equal(diagram.saveDocument().links[0].from.nodeId, 'source-b');
    diagram.undo();
    assert.equal(diagram.saveDocument().links[0].from.nodeId, 'source');
});

test('a connected input can be rewired in one drag without preselecting its link', () => {
    const { diagram, host, fakeWindow } = makeDiagram();
    diagram.load([{
        id: 'source', name: 'Source', x: 20, y: 50,
        outPorts: [{ id: 'out', name: 'Out', type: 'number' }],
    }, {
        id: 'sink-a', name: 'Sink A', x: 300, y: 20,
        inPorts: [{ id: 'in', name: 'In', type: 'number' }],
    }, {
        id: 'sink-b', name: 'Sink B', x: 300, y: 180,
        inPorts: [{ id: 'in', name: 'In', type: 'number' }],
    }], [{ id: 'stable-link', from: 'source', fromPort: 'out', to: 'sink-a', toPort: 'in' }]);

    const renderer = diagram as unknown as {
        findNode(id: string): { inPorts: Array<{ cx: number; cy: number }> } | undefined;
        toScreen(x: number, y: number): [number, number];
    };
    const oldPort = renderer.findNode('sink-a')!.inPorts[0];
    const newPort = renderer.findNode('sink-b')!.inPorts[0];
    const [oldX, oldY] = renderer.toScreen(oldPort.cx, oldPort.cy);
    const [newX, newY] = renderer.toScreen(newPort.cx, newPort.cy);
    host.canvas!.dispatch('pointerdown', {
        clientX: oldX, clientY: oldY, pointerId: 1, pointerType: 'mouse', button: 0,
        shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
    });
    host.canvas!.dispatch('pointermove', { clientX: newX, clientY: newY });
    fakeWindow.dispatch('pointerup', { clientX: newX, clientY: newY, shiftKey: false });

    assert.equal(diagram.saveDocument().links[0].to.nodeId, 'sink-b');
    assert.deepEqual(diagram.getSelection().linkIds, ['stable-link']);
});

test('direct output drags preserve single-link and multi-link port policies', () => {
    const setup = (maxLinks: number) => {
        const fixture = makeDiagram();
        fixture.diagram.load([{
            id: 'source-a', name: 'Source A', x: 20, y: 20,
            outPorts: [{ id: 'out', name: 'Out', type: 'number', maxLinks }],
        }, {
            id: 'source-b', name: 'Source B', x: 20, y: 180,
            outPorts: [{ id: 'out', name: 'Out', type: 'number' }],
        }, {
            id: 'sink-a', name: 'Sink A', x: 320, y: 20,
            inPorts: [{ id: 'in', name: 'In', type: 'number' }],
        }, {
            id: 'sink-b', name: 'Sink B', x: 320, y: 180,
            inPorts: [{ id: 'in', name: 'In', type: 'number' }],
        }], [{ id: 'stable-link', from: 'source-a', fromPort: 'out', to: 'sink-a', toPort: 'in' }]);
        return fixture;
    };
    const portPosition = (diagram: Diagram, nodeId: string, direction: 'inPorts' | 'outPorts') => {
        const renderer = diagram as unknown as {
            findNode(id: string): Record<typeof direction, Array<{ cx: number; cy: number }>> | undefined;
            toScreen(x: number, y: number): [number, number];
        };
        const port = renderer.findNode(nodeId)![direction][0];
        return renderer.toScreen(port.cx, port.cy);
    };
    const drag = (
        fixture: ReturnType<typeof setup>,
        from: [number, number],
        to: [number, number],
    ) => {
        fixture.host.canvas!.dispatch('pointerdown', {
            clientX: from[0], clientY: from[1], pointerId: 1, pointerType: 'mouse', button: 0,
            shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
        });
        fixture.host.canvas!.dispatch('pointermove', { clientX: to[0], clientY: to[1] });
        fixture.fakeWindow.dispatch('pointerup', { clientX: to[0], clientY: to[1], shiftKey: false });
    };

    const single = setup(1);
    drag(single, portPosition(single.diagram, 'source-a', 'outPorts'),
        portPosition(single.diagram, 'sink-b', 'inPorts'));
    assert.equal(single.diagram.saveDocument().links.length, 1);
    assert.equal(single.diagram.saveDocument().links[0].to.nodeId, 'sink-a');

    const multi = setup(0);
    drag(multi, portPosition(multi.diagram, 'source-a', 'outPorts'),
        portPosition(multi.diagram, 'sink-b', 'inPorts'));
    assert.equal(multi.diagram.saveDocument().links.length, 2);
    assert.ok(multi.diagram.saveDocument().links.some((link) => link.to.nodeId === 'sink-a'));
    assert.ok(multi.diagram.saveDocument().links.some((link) => link.to.nodeId === 'sink-b'));
});

test('dynamic input anchors grow typed siblings and prune them with the link', () => {
    const { diagram } = makeDiagram();
    diagram.load([{
        id: 'source-a', name: 'Source A',
        outPorts: [{ id: 'out', name: 'Out', type: 'Decimal' }],
    }, {
        id: 'source-b', name: 'Source B',
        outPorts: [{ id: 'out', name: 'Out', type: 'Decimal' }],
    }, {
        id: 'target', name: 'Target',
        inPorts: [{
            id: 'values', name: 'Value', type: 'Number', availableTypes: ['Decimal'],
            isDynamic: true, dynamicMode: 'onConnect', metadata: { socketKind: 'variadic' },
        }],
    }], []);

    assert.equal(diagram.addLink({
        id: 'dynamic-1', from: 'source-a', fromPort: 'out', to: 'target', toPort: 'values',
        metadata: { hostLinkId: 1 },
    }), true);
    let document = diagram.saveDocument();
    let target = document.nodes.find((node) => node.id === 'target')!;
    assert.deepEqual(target.inPorts.map((port) => port.id), ['values', 'values_1']);
    assert.deepEqual(target.inPorts[1], {
        id: 'values_1',
        name: 'Value 1',
        description: '',
        type: 'Decimal',
        maxLinks: 1,
        availableTypes: ['Decimal'],
        isDynamic: false,
        dynamicMode: '',
        isSibling: true,
        metadata: { socketKind: 'variadic' },
    });
    assert.equal(document.links[0].id, 'dynamic-1');
    assert.equal(document.links[0].to.portId, 'values_1');
    assert.deepEqual(document.links[0].metadata, { hostLinkId: 1 });

    diagram.undo();
    document = diagram.saveDocument();
    assert.equal(document.links.length, 0);
    assert.deepEqual(document.nodes.find((node) => node.id === 'target')!.inPorts.map((port) => port.id), ['values']);
    diagram.redo();
    assert.equal(diagram.saveDocument().links[0].to.portId, 'values_1');

    assert.equal(diagram.addLink({
        id: 'dynamic-2', from: 'source-b', fromPort: 'out', to: 'target', toPort: 'values',
    }), true);
    document = diagram.saveDocument();
    assert.deepEqual(document.nodes.find((node) => node.id === 'target')!.inPorts.map((port) => port.id),
        ['values', 'values_1', 'values_2']);
    const first = document.links.find((link) => link.id === 'dynamic-1')!;
    diagram.removeLink({
        id: first.id,
        from: first.from.nodeId,
        fromPort: first.from.portId,
        to: first.to.nodeId,
        toPort: first.to.portId,
    });
    document = diagram.saveDocument();
    assert.deepEqual(document.nodes.find((node) => node.id === 'target')!.inPorts.map((port) => port.id),
        ['values', 'values_2']);
    assert.deepEqual(document.links.map((link) => link.id), ['dynamic-2']);
    diagram.undo();
    assert.deepEqual(diagram.saveDocument().links.map((link) => link.id), ['dynamic-1', 'dynamic-2']);
    assert.ok(diagram.saveDocument().nodes.find((node) => node.id === 'target')!.inPorts
        .some((port) => port.id === 'values_1'));

    diagram.removeDiagramNode('source-a');
    document = diagram.saveDocument();
    assert.deepEqual(document.links.map((link) => link.id), ['dynamic-2']);
    assert.deepEqual(document.nodes.find((node) => node.id === 'target')!.inPorts.map((port) => port.id),
        ['values', 'values_2']);
    diagram.undo();
    document = diagram.saveDocument();
    assert.ok(document.nodes.some((node) => node.id === 'source-a'));
    assert.deepEqual(document.links.map((link) => link.id), ['dynamic-1', 'dynamic-2']);
    assert.deepEqual(document.nodes.find((node) => node.id === 'target')!.inPorts.map((port) => port.id),
        ['values', 'values_1', 'values_2']);
});

test('relinking to and from a dynamic anchor owns the sibling lifecycle', () => {
    const { diagram } = makeDiagram();
    diagram.load([{
        id: 'source', name: 'Source', outPorts: [{ id: 'out', name: 'Out', type: 'number' }],
    }, {
        id: 'regular', name: 'Regular', inPorts: [{ id: 'in', name: 'In', type: 'number' }],
    }, {
        id: 'dynamic', name: 'Dynamic', inPorts: [{
            id: 'items', name: 'Item', type: 'number', isDynamic: true, dynamicMode: 'onConnect',
        }],
    }], [{ id: 'link', from: 'source', fromPort: 'out', to: 'regular', toPort: 'in' }]);

    assert.deepEqual(diagram.relink('link', {
        from: 'source', fromPort: 'out', to: 'dynamic', toPort: 'items',
    }), { allowed: true, reason: 'allowed' });
    assert.equal(diagram.saveDocument().links[0].to.portId, 'items_1');
    assert.deepEqual(diagram.saveDocument().nodes.find((node) => node.id === 'dynamic')!.inPorts
        .map((port) => port.id), ['items', 'items_1']);
    diagram.undo();
    assert.equal(diagram.saveDocument().links[0].to.nodeId, 'regular');
    assert.deepEqual(diagram.saveDocument().nodes.find((node) => node.id === 'dynamic')!.inPorts
        .map((port) => port.id), ['items']);
    diagram.redo();

    assert.deepEqual(diagram.relink('link', {
        from: 'source', fromPort: 'out', to: 'regular', toPort: 'in',
    }), { allowed: true, reason: 'allowed' });
    assert.equal(diagram.saveDocument().links[0].to.nodeId, 'regular');
    assert.deepEqual(diagram.saveDocument().nodes.find((node) => node.id === 'dynamic')!.inPorts
        .map((port) => port.id), ['items']);
    diagram.undo();
    assert.equal(diagram.saveDocument().links[0].to.portId, 'items_1');
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

test('grid snapping keeps a dragged group rigid and records one undo action', () => {
    const { diagram, host, fakeWindow } = makeDiagram();
    diagram.load([{
        id: 'a', name: 'A', x: 13, y: 17,
    }, {
        id: 'b', name: 'B', x: 57, y: 65,
    }], []);
    diagram.setGridSnap(true, 10);
    diagram.selectNodesById(['a', 'b']);

    const renderer = diagram as unknown as {
        findNode(id: string): { x: number; y: number; w: number; h: number } | undefined;
        toScreen(x: number, y: number): [number, number];
    };
    const b = renderer.findNode('b')!;
    const [startX, startY] = renderer.toScreen(b.x + b.w / 2, b.y + b.h / 2);
    host.canvas!.dispatch('pointerdown', {
        clientX: startX, clientY: startY, pointerId: 1, pointerType: 'mouse', button: 0,
        shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
    });
    host.canvas!.dispatch('pointermove', { clientX: startX + 7, clientY: startY + 9 });
    fakeWindow.dispatch('pointerup', { clientX: startX + 7, clientY: startY + 9, shiftKey: false });

    assert.deepEqual(diagram.saveDocument().nodes.map(({ x, y }) => [x, y]), [[16, 22], [60, 70]]);
    diagram.undo();
    assert.deepEqual(diagram.saveDocument().nodes.map(({ x, y }) => [x, y]), [[13, 17], [57, 65]]);
    diagram.redo();
    assert.deepEqual(diagram.saveDocument().nodes.map(({ x, y }) => [x, y]), [[16, 22], [60, 70]]);
});

test('arrow keys nudge the selection using the configured grid step', () => {
    const { diagram, host } = makeDiagram();
    diagram.load([{ id: 'node', name: 'Node', x: 13, y: 17 }], []);
    diagram.selectNodesById(['node']);
    diagram.setGridSnap(true, 10);

    host.canvas!.dispatch('keydown', { key: 'ArrowRight', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false });
    host.canvas!.dispatch('keydown', { key: 'ArrowDown', shiftKey: true, ctrlKey: false, metaKey: false, altKey: false });
    assert.deepEqual([diagram.findNode('node')!.x, diagram.findNode('node')!.y], [23, 67]);
    diagram.undo();
    assert.deepEqual([diagram.findNode('node')!.x, diagram.findNode('node')!.y], [23, 17]);
    diagram.undo();
    assert.deepEqual([diagram.findNode('node')!.x, diagram.findNode('node')!.y], [13, 17]);

    diagram.setGridSnap(false);
    host.canvas!.dispatch('keydown', { key: 'ArrowLeft', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false });
    assert.equal(diagram.findNode('node')!.x, 12);
    diagram.setReadOnly(true);
    host.canvas!.dispatch('keydown', { key: 'ArrowLeft', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false });
    assert.equal(diagram.findNode('node')!.x, 12);
    assert.throws(() => diagram.setGridSnap(true, 0), /grid size/);
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
        findNode(id: string): { x: number; y: number; w: number; h: number; outPorts: Array<{ cx: number; cy: number }> } | undefined;
        toScreen(x: number, y: number): [number, number];
    };
    const open = internals.findNode('open')!;
    const [openX, openY] = internals.toScreen(open.x + open.w / 2, open.y + open.h / 2);
    host.canvas!.dispatch('dblclick', { clientX: openX, clientY: openY });

    const plain = internals.findNode('plain')!;
    const [plainX, plainY] = internals.toScreen(plain.x + plain.w / 2, plain.y + plain.h / 2);
    host.canvas!.dispatch('dblclick', { clientX: plainX, clientY: plainY });
    const [portX, portY] = internals.toScreen(open.outPorts[0].cx, open.outPorts[0].cy);
    host.canvas!.dispatch('dblclick', { clientX: portX, clientY: portY });

    assert.deepEqual(opened, ['open']);
});

test('screenshots copy the viewport or render full content without changing editor state', () => {
    const { diagram, host } = makeDiagram();
    diagram.load([{
        id: 'source', name: 'Source', x: -100, y: 40,
        outPorts: [{ id: 'out', name: 'Out', type: 'number' }],
    }, {
        id: 'sink', name: 'Sink', x: 260, y: 180,
        inPorts: [{ id: 'in', name: 'In', type: 'number' }],
    }], [{ from: 'source', fromPort: 'out', to: 'sink', toPort: 'in' }]);
    diagram.setViewState({ zoom: 1.4, panX: 65, panY: -25, overviewVisible: true });
    diagram.selectNodeById('source');
    diagram.setNodeError('source', 'Transient failure', { animate: false });
    const beforeView = diagram.getViewState();
    const beforeRuntime = diagram.getRuntimeState();
    const beforeSelection = diagram.getSelection();
    let viewEvents = 0;
    diagram.on('viewChanged', () => { viewEvents += 1; });

    const viewport = diagram.takeScreenshot() as unknown as FakeCanvas;
    assert.notEqual(viewport, host.canvas);
    assert.equal(viewport.width, host.canvas!.width);
    assert.equal(viewport.height, host.canvas!.height);
    assert.equal(viewport.drawImageCount, 1);

    const content = diagram.takeScreenshot({
        scope: 'content',
        pixelRatio: 2,
        padding: 20,
        background: '#abcdef',
        includeGrid: false,
        includeOverview: false,
        includeSelection: false,
        includeRuntimeState: false,
    }) as unknown as FakeCanvas;
    assert.ok(content.width > 0 && content.height > 0);
    assert.equal(content.width % 2, 0);
    assert.equal(content.height % 2, 0);
    assert.ok(content.fillStyles.includes('#abcdef'));
    assert.deepEqual(diagram.getViewState(), beforeView);
    assert.deepEqual(diagram.getRuntimeState(), beforeRuntime);
    assert.deepEqual(diagram.getSelection(), beforeSelection);
    assert.equal(viewEvents, 0);
    assert.throws(() => diagram.takeScreenshot({ scope: 'content', pixelRatio: 0 }), /pixelRatio/);
});

test('socket clicks expose mouse actions without starting links on right-click', () => {
    const { diagram, host, fakeWindow } = makeDiagram();
    diagram.load([source, sink], []);
    const renderer = diagram as unknown as {
        findNode(id: string): {
            inPorts: Array<{ cx: number; cy: number }>;
            outPorts: Array<{ cx: number; cy: number }>;
        } | undefined;
        toScreen(x: number, y: number): [number, number];
    };
    const sourcePort = renderer.findNode('source')!.outPorts[0];
    const sinkPort = renderer.findNode('sink')!.inPorts[0];
    const [sourceX, sourceY] = renderer.toScreen(sourcePort.cx, sourcePort.cy);
    const [sinkX, sinkY] = renderer.toScreen(sinkPort.cx, sinkPort.cy);
    const clicks: Array<{ action: string; ctrlKey: boolean; nodeId: string; portId: string }> = [];
    let contextPort: string | null = null;
    diagram.on('portClicked', ({ action, ctrlKey, node, port }) => {
        clicks.push({ action, ctrlKey, nodeId: node.id, portId: port.id });
    });
    diagram.on('contextMenu', ({ port }) => { contextPort = port?.port.id ?? null; });

    host.canvas!.dispatch('pointerdown', {
        clientX: sourceX, clientY: sourceY, pointerId: 1, pointerType: 'mouse', button: 2,
        ctrlKey: true, shiftKey: false, altKey: false, metaKey: false,
    });
    host.canvas!.dispatch('pointermove', { clientX: sinkX, clientY: sinkY });
    fakeWindow.dispatch('pointerup', { clientX: sinkX, clientY: sinkY, shiftKey: false });
    assert.equal(diagram.saveDocument().links.length, 0);
    host.canvas!.dispatch('contextmenu', { clientX: sourceX, clientY: sourceY });
    assert.equal(contextPort, 'out');

    host.canvas!.dispatch('pointerdown', {
        clientX: sourceX, clientY: sourceY, pointerId: 2, pointerType: 'mouse', button: 0,
        ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
    });
    host.canvas!.dispatch('pointermove', { clientX: sinkX, clientY: sinkY });
    fakeWindow.dispatch('pointerup', { clientX: sinkX, clientY: sinkY, shiftKey: false });
    assert.equal(diagram.saveDocument().links.length, 1);
    assert.deepEqual(clicks, [{
        action: 'rightClick', ctrlKey: true, nodeId: 'source', portId: 'out',
    }, {
        action: 'leftClick', ctrlKey: false, nodeId: 'source', portId: 'out',
    }]);
});

test('runtime debugger state renders without entering document history', () => {
    const { diagram, host } = makeDiagram();
    diagram.load([source], []);
    const before = diagram.saveDocument();
    const node = diagram.findNode('source')!;
    const port = node.outPorts[0];
    const events: string[] = [];
    diagram.on('runtimeStateChanged', ({ state }) => {
        events.push(state.activeNodeId ?? state.globalError?.kind ?? 'idle');
    });

    assert.equal(diagram.setActiveNode('source'), true);
    assert.equal(diagram.setActiveNode('missing'), false);
    assert.equal(diagram.setPortRuntimeState('source', 'out', 'out', {
        active: true,
        selected: true,
        breakpoint: true,
        breakpointActive: true,
        value: '42.5',
        error: 'Socket calculation failed.',
    }), true);
    assert.equal(diagram.setPortRuntimeState('source', 'out', 'missing', { active: true }), false);
    diagram.setGlobalError('The strategy is encrypted.', 'encrypted');

    const snapshot = diagram.getRuntimeState();
    assert.equal(snapshot.activeNodeId, 'source');
    assert.equal(snapshot.nodes.source.ports.out.out.value, '42.5');
    assert.equal(snapshot.globalError?.kind, 'encrypted');
    snapshot.nodes.source.ports.out.out.value = 'mutated outside';
    assert.equal(diagram.getRuntimeState().nodes.source.ports.out.out.value, '42.5');
    assert.deepEqual(diagram.saveDocument(), before);
    assert.equal(diagram.canUndo(), false);

    const internals = diagram as unknown as {
        draw(): void;
        drawTooltip(): void;
        drawGlobalError(): void;
        hoverPort: { node: typeof node; port: typeof port } | null;
        tipShow: boolean;
        cursor: { x: number; y: number };
    };
    internals.draw();
    assert.ok(host.canvas!.fillStyles.includes('#ffd1dc'));
    assert.ok(host.canvas!.strokeStyles.includes('#f6465d'));
    assert.ok(host.canvas!.drawnText.includes('The strategy is encrypted.'));

    diagram.setGlobalError(null);
    internals.hoverPort = { node, port };
    internals.tipShow = true;
    internals.cursor = { x: 30, y: 30 };
    internals.drawTooltip();
    assert.ok(host.canvas!.drawnText.includes('Value: 42.5'));
    assert.ok(host.canvas!.drawnText.includes('Socket calculation failed.'));
    assert.ok(events.length >= 3);

    diagram.clearRuntimeState();
    assert.deepEqual(diagram.getRuntimeState(), { activeNodeId: null, nodes: {}, globalError: null });
    assert.deepEqual(diagram.saveDocument(), before);
});

test('hovering a node highlights every connected wire like the desktop control', () => {
    const { diagram, host } = makeDiagram();
    diagram.load([source, sink], [
        { from: 'source', fromPort: 'out', to: 'sink', toPort: 'in' },
    ]);
    const internals = diagram as unknown as {
        draw(): void;
        hoverNode: ReturnType<typeof diagram.findNode>;
    };
    host.canvas!.strokeStyles.length = 0;
    internals.hoverNode = diagram.findNode('source');
    internals.draw();

    assert.ok(host.canvas!.strokeStyles.includes('#cfe3ff'));
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
    const fakeWindow = installDom();
    const {
        DiagramNode,
        Node,
        Port,
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
    assert.equal(diagram.updatePort('high-level', 'out', 'value', {
        type: 'Object', maxLinks: 2, availableTypes: ['Any'],
    }), true);
    assert.deepEqual(diagram.save().nodes[0].outPorts[0], new Port({
        id: 'value', name: 'Value', type: 'Object', maxLinks: 2, availableTypes: ['Any'],
    }));
    diagram.undo();
    assert.equal(diagram.save().nodes[0].outPorts[0].type, 'Decimal');
    const canvas = diagram.renderer;
    assert.equal(canvas.save().nodes.length, 1);
    let clicked: { nodeId: string; portId: string; direction: string; action: string } | null = null;
    diagram.on('portClicked', ({ node, port, direction, action }) => {
        clicked = { nodeId: node.id, portId: port.id, direction, action };
    });
    const port = canvas.findNode('high-level')!.outPorts[0];
    const [portX, portY] = (canvas as unknown as { toScreen(x: number, y: number): [number, number] })
        .toScreen(port.cx, port.cy);
    host.canvas!.dispatch('pointerdown', {
        clientX: portX, clientY: portY, pointerId: 1, pointerType: 'mouse', button: 0,
        ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
    });
    fakeWindow.dispatch('pointerup', { clientX: portX, clientY: portY, shiftKey: false });
    assert.deepEqual(clicked, {
        nodeId: 'high-level', portId: 'value', direction: 'out', action: 'leftClick',
    });
});

test('built-in fullscreen button can be hidden by options and changed at runtime', async () => {
    installDom();
    const { StockSharpCatalog, StockSharpDiagram } = await import('../src/index');
    const host = new FakeHost();
    const previousPosition = host.style.position;
    const diagram = new StockSharpDiagram({
        div: host as unknown as HTMLElement,
        catalog: new StockSharpCatalog(),
        showFullscreenButton: false,
    });

    assert.equal(diagram.isFullscreenButtonVisible(), false);
    assert.equal(host.button?.hidden, true);
    assert.equal(host.button?.style.display, 'none');
    assert.equal(host.button?.getAttribute('data-ssdiagram-fullscreen-button'), '');
    assert.equal(host.style.position, 'relative');

    diagram.setFullscreenButtonVisible(true);
    assert.equal(diagram.isFullscreenButtonVisible(), true);
    assert.equal(host.button?.hidden, false);
    assert.equal(host.button?.style.display, 'inline-flex');

    const button = host.button!;
    diagram.destroy();
    assert.equal(button.removed, true);
    assert.equal(host.style.position, previousPosition);
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
    const image = diagram.takeScreenshot({ scope: 'content', pixelRatio: 1 });
    assert.ok(image.width > 0 && image.height > 0);
});

test('high-level view settings persist separately and report viewport changes', async () => {
    installDom();
    const {
        DiagramViewStateError,
        StockSharpCatalog,
        StockSharpDiagram,
    } = await import('../src/index');
    const host = new FakeHost();
    const diagram = new StockSharpDiagram({
        div: host as unknown as HTMLElement,
        catalog: new StockSharpCatalog(),
    });
    const changes: Array<{ zoom: number; panX: number; panY: number; overviewVisible: boolean }> = [];
    diagram.on('viewChanged', (state) => changes.push(state));
    diagram.setViewState({ zoom: 1.5, panX: -80, panY: 25, overviewVisible: false });

    const persisted = diagram.saveViewState();
    diagram.setViewState({ zoom: 1, panX: 0, panY: 0, overviewVisible: true });
    diagram.loadViewState(persisted);
    assert.deepEqual(diagram.getViewState(), {
        zoom: 1.5, panX: -80, panY: 25, overviewVisible: false,
    });
    assert.equal(JSON.parse(persisted).version, 1);
    assert.deepEqual(changes.at(-1), diagram.getViewState());

    const before = diagram.getViewState();
    assert.throws(() => diagram.loadViewState({
        version: 1,
        view: { zoom: 'invalid', panX: 0, panY: 0, overviewVisible: true },
    }), DiagramViewStateError);
    assert.deepEqual(diagram.getViewState(), before);
});

test('interactive panning emits one settled viewChanged event', () => {
    const { diagram, host, fakeWindow } = makeDiagram();
    const views: Array<{ panX: number; panY: number }> = [];
    diagram.on('viewChanged', ({ panX, panY }) => views.push({ panX, panY }));

    host.canvas!.dispatch('pointerdown', {
        clientX: 100, clientY: 100, pointerId: 1, pointerType: 'mouse', button: 1,
        shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
    });
    host.canvas!.dispatch('pointermove', { clientX: 145, clientY: 125 });
    fakeWindow.dispatch('pointerup', { clientX: 145, clientY: 125, shiftKey: false });

    assert.deepEqual(views, [{ panX: 45, panY: 25 }]);
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

test('high-level transaction groups property edits and rolls them back on failure', async () => {
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

    const result = diagram.transaction('update properties', () => {
        diagram.setNodeName('node', 'Configured node');
        diagram.setNodeParamValue('node', 'Period', '20');
        return 42;
    });
    assert.equal(result, 42);
    assert.equal(diagram.save().nodes[0].name, 'Configured node');
    assert.deepEqual(diagram.save().nodes[0].paramValues, { Period: '20' });

    diagram.undo();
    assert.equal(diagram.save().nodes[0].name, 'Node');
    assert.deepEqual(diagram.save().nodes[0].paramValues, {});
    diagram.redo();
    assert.equal(diagram.save().nodes[0].name, 'Configured node');
    assert.deepEqual(diagram.save().nodes[0].paramValues, { Period: '20' });

    assert.throws(() => diagram.transaction('broken properties', () => {
        diagram.setNodeName('node', 'Half applied');
        diagram.setNodeParamValue('node', 'Period', '50');
        throw new Error('host validation failed');
    }), /host validation failed/);
    assert.equal(diagram.save().nodes[0].name, 'Configured node');
    assert.deepEqual(diagram.save().nodes[0].paramValues, { Period: '20' });
});

test('context command registry executes built-ins and leaves host actions typed', async () => {
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
    diagram.load([
        new DiagramNode({
            id: 'source',
            name: 'Source',
            openAction: 'settings',
            outPorts: [{ id: 'out', name: 'Out' }],
        }),
        new DiagramNode({
            id: 'sink',
            name: 'Sink',
            inPorts: [{ id: 'in', name: 'In' }],
        }),
    ], [new Link({ outNode: 'source', outPort: 'out', inNode: 'sink', inPort: 'in' })]);
    diagram.selectNodes(['source']);

    const states = new Map(diagram.getContextCommands().map(({ command, enabled }) => [command, enabled]));
    assert.equal(states.get('copy'), true);
    assert.equal(states.get('delete'), true);
    assert.equal(states.get('open'), true);
    assert.equal(states.get('paste'), false);

    const executed: string[] = [];
    const properties: string[] = [];
    diagram.on('contextCommand', ({ command }) => executed.push(command));
    diagram.on('nodeProperties', ({ nodes }) => properties.push(nodes[0].id));
    assert.equal(diagram.executeContextCommand('copy'), true);
    assert.equal(diagram.executeContextCommand('properties'), true);
    assert.deepEqual(executed, ['copy', 'properties']);
    assert.deepEqual(properties, ['source']);
    assert.equal(new Map(diagram.getContextCommands().map(({ command, enabled }) => [command, enabled])).get('paste'), true);

    const linkId = diagram.saveDocument().links[0].id;
    diagram.selectLink(linkId);
    assert.equal(diagram.executeContextCommand('delete'), true);
    assert.equal(diagram.saveDocument().links.length, 0);
    diagram.undo();
    assert.equal(diagram.saveDocument().links[0].id, linkId);

    diagram.setReadOnly(true);
    diagram.selectNodes(['source']);
    const readOnlyStates = new Map(diagram.getContextCommands().map(({ command, enabled }) => [command, enabled]));
    assert.equal(readOnlyStates.get('copy'), true);
    assert.equal(readOnlyStates.get('open'), true);
    assert.equal(readOnlyStates.get('delete'), false);
    assert.equal(readOnlyStates.get('paste'), false);
});

test('system clipboard transfers a lossless document and pastes as one transaction', async () => {
    installDom();
    const {
        StockSharpCatalog,
        StockSharpDiagram,
        createDiagramDocument,
        parseDiagramDocument,
    } = await import('../src/index');
    let clipboardText = '';
    const clipboard = {
        readText: async () => clipboardText,
        writeText: async (value: string) => { clipboardText = value; },
    };
    const sourceHost = new FakeHost();
    const sourceDiagram = new StockSharpDiagram({
        div: sourceHost as unknown as HTMLElement,
        catalog: new StockSharpCatalog(),
        clipboard,
    });
    sourceDiagram.loadDocument(createDiagramDocument({
        nodes: [{
            id: 'source',
            name: 'Source',
            outPorts: [{ id: 'out', name: 'Out', metadata: { hostPortId: 1 } }],
            paramValues: { Period: '20' },
            metadata: { hostNodeId: 2 },
        }, {
            id: 'sink',
            name: 'Sink',
            inPorts: [{ id: 'in', name: 'In' }],
        }],
        links: [{
            id: 'original-link',
            from: { nodeId: 'source', portId: 'out' },
            to: { nodeId: 'sink', portId: 'in' },
            metadata: { hostLinkId: 3 },
        }],
    }));
    sourceDiagram.selectNodes(['source', 'sink']);
    assert.equal(await sourceDiagram.copySelectionToClipboard(), true);
    assert.equal(parseDiagramDocument(clipboardText).nodes.length, 2);

    const targetHost = new FakeHost();
    const targetDiagram = new StockSharpDiagram({
        div: targetHost as unknown as HTMLElement,
        catalog: new StockSharpCatalog(),
        clipboard,
    });
    assert.equal(await targetDiagram.pasteSelectionFromClipboard(), true);

    const pasted = targetDiagram.saveDocument();
    assert.equal(pasted.nodes.length, 2);
    assert.equal(pasted.links.length, 1);
    assert.deepEqual(pasted.nodes[0].metadata, { hostNodeId: 2 });
    assert.deepEqual(pasted.nodes[0].outPorts[0].metadata, { hostPortId: 1 });
    assert.deepEqual(pasted.nodes[0].paramValues, { Period: '20' });
    assert.deepEqual(pasted.links[0].metadata, { hostLinkId: 3 });

    targetDiagram.undo();
    assert.equal(targetDiagram.saveDocument().nodes.length, 0);
    assert.equal(targetDiagram.saveDocument().links.length, 0);
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

test('failed document load keeps the current scheme and exposes a global load error', async () => {
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
    const valid = createDiagramDocument({ nodes: [{ id: 'safe', name: 'Safe scheme' }] });
    diagram.loadDocument(valid);
    const before = diagram.saveDocument();
    const failures: string[] = [];
    diagram.on('documentLoadFailed', ({ message }) => failures.push(message));

    assert.throws(() => diagram.loadDocument('{ broken json'), /JSON/i);
    assert.deepEqual(diagram.saveDocument(), before);
    assert.equal(diagram.getRuntimeState().globalError?.kind, 'load');
    assert.equal(failures.length, 1);
    (diagram.renderer as unknown as { draw(): void }).draw();
    assert.ok(host.canvas!.drawnText.some((text) => /JSON/i.test(text)));

    diagram.loadDocument(valid);
    assert.equal(diagram.getRuntimeState().globalError, null);
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
        outPorts: [{ id: 'orders', name: 'Orders', type: 'Order' }],
    })], []);

    const canvas = diagram.renderer as unknown as {
        findNode(id: string): { runtimeError: string } | undefined;
    };
    assert.equal(diagram.setNodeError('failed', 'Calculation failed.'), true);
    assert.equal(canvas.findNode('failed')?.runtimeError, 'Calculation failed.');
    let runtimeEvents = 0;
    diagram.on('runtimeStateChanged', () => { runtimeEvents += 1; });
    assert.equal(diagram.setActiveNode('failed'), true);
    assert.equal(diagram.setPortRuntimeState('failed', 'out', 'orders', {
        breakpoint: true, value: 'Buy 1',
    }), true);
    diagram.setGlobalError('Debugger paused.', 'locked');
    assert.equal(diagram.getRuntimeState().nodes.failed.ports.out.orders.value, 'Buy 1');
    assert.equal(diagram.getRuntimeState().globalError?.kind, 'locked');
    assert.ok(runtimeEvents >= 3);
    assert.equal(diagram.clearNodeError('failed'), true);
    assert.equal(canvas.findNode('failed')?.runtimeError, '');
    diagram.clearRuntimeState();
    assert.deepEqual(diagram.getRuntimeState(), { activeNodeId: null, nodes: {}, globalError: null });
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
