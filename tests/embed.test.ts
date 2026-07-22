import assert from 'node:assert/strict';
import test from 'node:test';

import {
    destroyRenderedDiagram,
    renderFromSource,
    renderScheme,
    type DiagramEmbedScheme,
} from '../src/embed';

class FakeClassList {
    private readonly values = new Set<string>();
    add(...values: string[]): void { values.forEach((value) => this.values.add(value)); }
    remove(...values: string[]): void { values.forEach((value) => this.values.delete(value)); }
    contains(value: string): boolean { return this.values.has(value); }
    toggle(value: string, force?: boolean): boolean {
        const next = force ?? !this.values.has(value);
        if (next) this.values.add(value); else this.values.delete(value);
        return next;
    }
}

class FakeCanvas {
    readonly style: Record<string, string> = {};
    parentElement: FakeHost | null = null;
    tabIndex = 0;
    width = 0;
    height = 0;
    private readonly listeners = new Map<string, EventListenerOrEventListenerObject[]>();
    private readonly context = new Proxy({
        globalAlpha: 1,
        measureText: (text: string) => ({ width: text.length * 7 }),
        setTransform: () => undefined,
    }, {
        get(target, property) {
            if (property in target) return target[property as keyof typeof target];
            return () => undefined;
        },
        set(target, property, value) {
            (target as Record<PropertyKey, unknown>)[property] = value;
            return true;
        },
    });

    getContext(): CanvasRenderingContext2D { return this.context as unknown as CanvasRenderingContext2D; }
    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
        this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener));
    }
    getBoundingClientRect(): DOMRect {
        return { left: 0, top: 0, right: 800, bottom: 480, width: 800, height: 480, x: 0, y: 0, toJSON: () => ({}) };
    }
    setPointerCapture(): void {}
    focus(): void {}
    remove(): void {
        if (this.parentElement === null) return;
        const index = this.parentElement.children.indexOf(this);
        if (index >= 0) this.parentElement.children.splice(index, 1);
        this.parentElement = null;
    }
}

class FakeHost {
    readonly children: FakeCanvas[] = [];
    readonly style: Record<string, string> = {};
    readonly dataset: Record<string, string | undefined> = {};
    readonly classList = new FakeClassList();
    parentElement: FakeHost | null = null;
    clientWidth = 800;
    clientHeight = 480;
    isConnected = true;
    textContent = '';

    appendChild(canvas: FakeCanvas): FakeCanvas {
        canvas.parentElement = this;
        this.children.push(canvas);
        return canvas;
    }
    replaceChildren(): void {
        for (const canvas of this.children) canvas.parentElement = null;
        this.children.length = 0;
        this.textContent = '';
    }
    closest(): null { return null; }
    getBoundingClientRect(): DOMRect {
        return { left: 0, top: 0, right: 800, bottom: 480, width: 800, height: 480, x: 0, y: 0, toJSON: () => ({}) };
    }
}

class FakeMutationObserver {
    static readonly instances: FakeMutationObserver[] = [];
    disconnected = false;
    constructor(private readonly callback: MutationCallback) {
        FakeMutationObserver.instances.push(this);
    }
    observe(): void {}
    disconnect(): void { this.disconnected = true; }
    trigger(): void { if (!this.disconnected) this.callback([], this as unknown as MutationObserver); }
}

class FakeResizeObserver {
    static readonly instances: FakeResizeObserver[] = [];
    disconnected = false;
    constructor(private readonly callback: ResizeObserverCallback) {
        FakeResizeObserver.instances.push(this);
    }
    observe(): void {}
    disconnect(): void { this.disconnected = true; }
    trigger(): void { if (!this.disconnected) this.callback([], this as unknown as ResizeObserver); }
}

class FakeWindow {
    devicePixelRatio = 1;
    private readonly listeners = new Map<string, EventListener[]>();
    addEventListener(type: string, listener: EventListener): void {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }
    removeEventListener(type: string, listener: EventListener): void {
        this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener));
    }
}

const emptyScheme: DiagramEmbedScheme = { nodes: [], links: [] };
const palette = { socketTypes: [], elements: [] };

function installDom(fetchImpl: typeof fetch): void {
    FakeMutationObserver.instances.length = 0;
    FakeResizeObserver.instances.length = 0;
    const documentElement = {};
    Object.assign(globalThis, {
        document: {
            documentElement,
            createElement: (tag: string) => {
                assert.equal(tag, 'canvas');
                return new FakeCanvas();
            },
        },
        window: new FakeWindow(),
        MutationObserver: FakeMutationObserver,
        ResizeObserver: FakeResizeObserver,
        requestAnimationFrame: () => 1,
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
        Image: class {},
        fetch: fetchImpl,
    });
}

function paletteResponse(): Response {
    return { json: async () => palette } as Response;
}

test('embed rendering replaces and disposes every resource owned by a host', async () => {
    installDom(async () => paletteResponse());
    const host = new FakeHost();
    host.classList.add('ss-diagram-error');

    const first = await renderScheme(host as unknown as HTMLElement, '/palette.json', emptyScheme);
    assert.notEqual(first, null);
    assert.equal(host.children.length, 1);
    assert.equal(host.dataset.rendered, '1');
    assert.equal(host.classList.contains('ss-diagram-error'), false);

    const firstResize = FakeResizeObserver.instances[0];
    const firstTheme = FakeMutationObserver.instances.find((observer) => !observer.disconnected)!;
    const second = await renderScheme(host as unknown as HTMLElement, '/palette.json', emptyScheme);
    assert.notEqual(second, null);
    assert.equal(first!.destroyed, true);
    assert.equal(firstResize.disconnected, true);
    assert.equal(firstTheme.disconnected, true);
    assert.equal(host.children.length, 1);

    assert.equal(destroyRenderedDiagram(host as unknown as HTMLElement), true);
    assert.equal(second!.destroyed, true);
    assert.equal(host.children.length, 0);
    assert.equal(host.dataset.rendered, undefined);
    assert.equal(destroyRenderedDiagram(host as unknown as HTMLElement), false);

    const third = await renderScheme(host as unknown as HTMLElement, '/palette.json', emptyScheme);
    assert.notEqual(third, null);
    host.isConnected = false;
    for (const observer of FakeMutationObserver.instances) observer.trigger();
    assert.equal(third!.destroyed, true);
    assert.equal(host.children.length, 0);
});

test('a stale async render cannot replace a newer host render', async () => {
    const responses: Array<(response: Response) => void> = [];
    installDom(() => new Promise<Response>((resolve) => responses.push(resolve)));
    const host = new FakeHost();

    const older = renderScheme(host as unknown as HTMLElement, '/old-palette.json', emptyScheme);
    const newer = renderScheme(host as unknown as HTMLElement, '/new-palette.json', emptyScheme);
    assert.equal(responses.length, 2);
    responses[1](paletteResponse());
    const current = await newer;
    assert.notEqual(current, null);
    responses[0](paletteResponse());
    assert.equal(await older, null);
    assert.equal(host.children.length, 1);

    current!.destroy();
    assert.equal(host.children.length, 0);
});

test('a stale source failure cannot replace a newer successful render with an error note', async () => {
    let resolveOlder!: (response: Response) => void;
    const raw = JSON.stringify({
        Content: { Value: { Scheme: { Model: {
            Nodes: [{ Key: 'node', TypeId: 'missing', X: 0, Y: 0 }],
            Links: [],
        } } } },
    });
    installDom((input) => {
        const url = String(input);
        if (url === '/older.json') return new Promise<Response>((resolve) => { resolveOlder = resolve; });
        if (url === '/newer.json') return Promise.resolve({ ok: true, text: async () => raw } as Response);
        if (url === '/palette.json') return Promise.resolve(paletteResponse());
        throw new Error(`Unexpected URL: ${url}`);
    });
    const host = new FakeHost();

    const older = renderFromSource(
        host as unknown as HTMLElement, '/palette.json', '/older.json',
    );
    const newer = await renderFromSource(
        host as unknown as HTMLElement, '/palette.json', '/newer.json',
    );
    assert.notEqual(newer, null);
    resolveOlder({ ok: false } as Response);
    assert.equal(await older, null);
    assert.equal(newer!.destroyed, false);
    assert.equal(host.children.length, 1);
    assert.equal(host.classList.contains('ss-diagram-error'), false);
    const missingNode = newer!.diagram.save().nodes[0];
    assert.equal(missingNode.isPlaceholder, true);
    assert.equal(newer!.diagram.getRuntimeState().nodes.node.error?.kind, 'load');
    assert.match(newer!.diagram.getRuntimeState().nodes.node.error?.message ?? '', /missing/i);

    newer!.destroy();
});
