import assert from 'node:assert/strict';
import test from 'node:test';

import { StockSharpCatalog } from '../src/diagram/catalog';
import { PALETTE_DRAG_MIME, StockSharpPalette } from '../src/diagram/palette';
import { Node } from '../src/diagram/types';

class FakeClassList {
    private readonly values = new Set<string>();

    set(value: string): void {
        this.values.clear();
        for (const item of value.split(/\s+/).filter(Boolean)) this.values.add(item);
    }

    add(...values: string[]): void {
        for (const value of values) this.values.add(value);
    }

    remove(...values: string[]): void {
        for (const value of values) this.values.delete(value);
    }

    contains(value: string): boolean {
        return this.values.has(value);
    }

    toggle(value: string, force?: boolean): boolean {
        const next = force ?? !this.values.has(value);
        if (next) this.values.add(value);
        else this.values.delete(value);
        return next;
    }

    toString(): string {
        return [...this.values].join(' ');
    }
}

class FakeElement {
    readonly children: FakeElement[] = [];
    readonly classList = new FakeClassList();
    readonly dataset: Record<string, string> = {};
    readonly attributes = new Map<string, string>();
    readonly listeners = new Map<string, Array<(event: Record<string, unknown>) => void>>();
    parentElement: FakeElement | null = null;
    textContent = '';
    title = '';
    type = '';
    src = '';
    alt = '';
    draggable = false;
    tabIndex = -1;

    constructor(readonly tagName: string) {}

    get className(): string {
        return this.classList.toString();
    }

    set className(value: string) {
        this.classList.set(value);
    }

    appendChild<T extends FakeElement>(child: T): T {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    replaceChildren(...children: FakeElement[]): void {
        for (const child of this.children) child.parentElement = null;
        this.children.length = 0;
        for (const child of children) this.appendChild(child);
    }

    remove(): void {
        if (this.parentElement === null) return;
        const index = this.parentElement.children.indexOf(this);
        if (index >= 0) this.parentElement.children.splice(index, 1);
        this.parentElement = null;
    }

    setAttribute(name: string, value: string): void {
        this.attributes.set(name, value);
    }

    getAttribute(name: string): string | null {
        return this.attributes.get(name) ?? null;
    }

    removeAttribute(name: string): void {
        this.attributes.delete(name);
    }

    addEventListener(type: string, listener: (event: Record<string, unknown>) => void): void {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    dispatch(type: string, init: Record<string, unknown> = {}): { defaultPrevented: boolean } {
        const result = { defaultPrevented: false };
        const event = {
            type,
            preventDefault: () => { result.defaultPrevented = true; },
            ...init,
        };
        for (const listener of this.listeners.get(type) ?? []) listener(event);
        return result;
    }

    querySelectorAll<T extends FakeElement>(selector: string): T[] {
        assert.match(selector, /^\.[a-z0-9-]+$/i);
        const className = selector.slice(1);
        const result: FakeElement[] = [];
        const visit = (element: FakeElement): void => {
            for (const child of element.children) {
                if (child.classList.contains(className)) result.push(child);
                visit(child);
            }
        };
        visit(this);
        return result as T[];
    }

    querySelector<T extends FakeElement>(selector: string): T | null {
        return this.querySelectorAll<T>(selector)[0] ?? null;
    }
}

function installDom(): void {
    Object.assign(globalThis, {
        document: {
            createElement: (tagName: string) => new FakeElement(tagName),
        },
    });
}

function item(host: FakeElement, typeId: string): FakeElement {
    const found = host.querySelectorAll<FakeElement>('.d-palette-item')
        .find((candidate) => candidate.dataset.typeId === typeId);
    assert.notEqual(found, undefined, `Palette item ${typeId} was not rendered.`);
    return found!;
}

test('palette exposes typed selection, activation, context and drag actions to its host', () => {
    installDom();
    const catalog = new StockSharpCatalog();
    const definition = new Node({
        id: 'SMA',
        name: 'Simple Moving Average',
        description: 'Smooths source values.',
        groupName: 'Indicators',
    });
    catalog.addNodeType(definition);
    const host = new FakeElement('div');
    const palette = new StockSharpPalette({
        div: host as unknown as HTMLElement,
        catalog,
    });
    const selected: Array<string | null> = [];
    const activated: string[] = [];
    const contexts: Array<[string, number, number]> = [];
    palette.on('selectionChanged', ({ node }) => selected.push(node?.id ?? null));
    palette.on('nodeActivated', ({ node }) => activated.push(node.id));
    palette.on('contextMenuRequested', ({ node, x, y }) => contexts.push([node.id, x, y]));

    const rendered = item(host, 'SMA');
    rendered.dispatch('click');
    rendered.dispatch('dblclick');
    rendered.dispatch('keydown', { key: 'Enter' });
    const contextEvent = rendered.dispatch('contextmenu', { clientX: 25, clientY: 40 });
    const transfer = {
        effectAllowed: '',
        values: new Map<string, string>(),
        setData(type: string, value: string) { this.values.set(type, value); },
    };
    rendered.dispatch('dragstart', { dataTransfer: transfer });

    assert.deepEqual(selected, ['SMA']);
    assert.deepEqual(activated, ['SMA', 'SMA']);
    assert.deepEqual(contexts, [['SMA', 25, 40]]);
    assert.equal(contextEvent.defaultPrevented, true);
    assert.equal(rendered.classList.contains('is-selected'), true);
    assert.equal(rendered.getAttribute('aria-selected'), 'true');
    assert.equal(transfer.effectAllowed, 'copy');
    assert.equal(transfer.values.get(PALETTE_DRAG_MIME), JSON.stringify({ typeId: 'SMA' }));
    assert.notEqual(palette.getSelectedNodeType(), definition);
    assert.equal(palette.getSelectedNodeType()?.id, 'SMA');
});

test('palette preserves tree state while filtering and supports dynamic exclusions and disposal', () => {
    installDom();
    const catalog = new StockSharpCatalog();
    catalog.addNodeType(new Node({
        id: 'sma', name: 'SMA', description: 'Smooths values', groupName: 'Indicators',
    }));
    catalog.addNodeType(new Node({
        id: 'ema', name: 'EMA', description: 'Weights values', groupName: 'Indicators',
    }));
    catalog.addNodeType(new Node({
        id: 'order', name: 'Order', groupName: 'Trading',
    }));
    const host = new FakeElement('div');
    const palette = new StockSharpPalette({
        div: host as unknown as HTMLElement,
        catalog,
        excludedTypeIds: ['ORDER'],
    });

    assert.deepEqual(host.querySelectorAll<FakeElement>('.d-palette-item').map((entry) => entry.dataset.typeId),
        ['sma', 'ema']);
    palette.collapseAll();
    let group = host.querySelector<FakeElement>('.d-palette-group')!;
    assert.equal(group.classList.contains('is-collapsed'), true);

    palette.setFilter('smooths');
    group = host.querySelector<FakeElement>('.d-palette-group')!;
    assert.equal(group.classList.contains('is-collapsed'), false);
    assert.equal(item(host, 'sma').classList.contains('is-hidden'), false);
    assert.equal(item(host, 'ema').classList.contains('is-hidden'), true);

    palette.setFilter('indicators');
    assert.equal(item(host, 'sma').classList.contains('is-hidden'), false);
    assert.equal(item(host, 'ema').classList.contains('is-hidden'), false);
    palette.setFilter('');
    assert.equal(group.classList.contains('is-collapsed'), true);

    const selections: Array<string | null> = [];
    palette.on('selectionChanged', ({ node }) => selections.push(node?.id ?? null));
    assert.equal(palette.selectNodeType('SMA'), true);
    palette.setNodeTypeExcluded('sma');
    assert.deepEqual(selections, ['sma', null]);
    assert.equal(palette.getSelectedNodeType(), null);
    assert.equal(host.querySelectorAll<FakeElement>('.d-palette-item').length, 1);

    palette.setExcludedTypeIds([]);
    assert.equal(host.querySelectorAll<FakeElement>('.d-palette-item').length, 3);
    palette.destroy();
    palette.destroy();
    assert.equal(host.children.length, 0);
    assert.equal(host.classList.contains('d-palette'), false);
    assert.equal(host.getAttribute('role'), null);

    catalog.addNodeType(new Node({ id: 'late', name: 'Late registration' }));
    assert.equal(host.children.length, 0);
});
