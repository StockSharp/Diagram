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
export const PALETTE_DRAG_MIME = 'application/x-stocksharp-node';

/**
 * Accessible HTML palette for catalog node types.
 *
 * The component owns the contents of `div`. The host decides what activation
 * and context-menu actions mean by subscribing to the typed events.
 */
export class StockSharpPalette extends EventEmitter<PaletteEvents> {
    private readonly host: HTMLElement;
    private readonly catalog: StockSharpCatalog;
    private readonly unsubscribeCatalog: () => void;
    private filter = '';
    private collapsed = new Set<string>();
    private excludedTypeIds: Set<string>;
    private selectedTypeId: string | null = null;
    private destroyed = false;

    constructor({ div, catalog, excludedTypeIds = [] }: PaletteOptions) {
        super();
        this.host = div;
        this.catalog = catalog;
        this.excludedTypeIds = new Set(Array.from(excludedTypeIds, normalizeTypeId));
        this.host.classList.add('d-palette');
        this.host.setAttribute('role', 'tree');
        this.unsubscribeCatalog = this.catalog.on('nodeTypesChanged', () => this.render());
        this.render();
    }

    setFilter(text: string): void {
        if (this.destroyed) return;
        this.filter = (text ?? '').trim().toLowerCase();
        this.applyFilter();
    }

    collapseAll(): void {
        if (this.destroyed) return;
        for (const groupName of this.groupNames()) this.collapsed.add(groupName);
        this.applyFilter();
    }

    expandAll(): void {
        if (this.destroyed) return;
        this.collapsed.clear();
        this.applyFilter();
    }

    /** Replaces the WPF palette's dynamic ExcludedTypeIds set. */
    setExcludedTypeIds(typeIds: Iterable<string>): void {
        if (this.destroyed) return;
        const next = new Set(Array.from(typeIds, normalizeTypeId));
        if (setsEqual(this.excludedTypeIds, next)) return;
        this.excludedTypeIds = next;
        this.render();
    }

    setNodeTypeExcluded(typeId: string, excluded = true): void {
        if (this.destroyed) return;
        const normalized = normalizeTypeId(typeId);
        const changed = excluded
            ? !this.excludedTypeIds.has(normalized)
            : this.excludedTypeIds.has(normalized);
        if (!changed) return;
        if (excluded) this.excludedTypeIds.add(normalized);
        else this.excludedTypeIds.delete(normalized);
        this.render();
    }

    getExcludedTypeIds(): string[] {
        return [...this.excludedTypeIds];
    }

    getSelectedNodeType(): Node | null {
        return this.selectedTypeId === null
            ? null
            : this.visibleNodeType(this.selectedTypeId)?.clone() ?? null;
    }

    selectNodeType(typeId: string | null): boolean {
        if (this.destroyed) return false;
        const node = typeId === null ? null : this.visibleNodeType(typeId);
        if (typeId !== null && node === null) return false;
        const next = node === null ? null : normalizeTypeId(node.id);
        if (next === this.selectedTypeId) return true;
        this.selectedTypeId = next;
        this.syncSelectionClass();
        this.emit('selectionChanged', { node: node?.clone() ?? null });
        return true;
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.unsubscribeCatalog();
        this.host.replaceChildren();
        this.host.classList.remove('d-palette');
        this.host.removeAttribute('role');
        this.clearEventHandlers();
    }

    private groupNames(): Set<string> {
        return new Set(this.visibleNodeTypes().map((node) => groupNameOf(node)));
    }

    private visibleNodeTypes(): Node[] {
        return this.catalog.getNodeTypes()
            .filter((node) => !this.excludedTypeIds.has(normalizeTypeId(node.id)));
    }

    private visibleNodeType(typeId: string): Node | null {
        const node = this.catalog.getNodeType(typeId);
        return node !== null && !this.excludedTypeIds.has(normalizeTypeId(node.id)) ? node : null;
    }

    private render(): void {
        if (this.destroyed) return;
        this.reconcileSelection();
        this.host.replaceChildren();
        const tree = document.createElement('ul');
        tree.className = 'd-palette-tree';
        tree.setAttribute('role', 'group');

        const groups = new Map<string, Node[]>();
        for (const node of this.visibleNodeTypes()) {
            const name = groupNameOf(node);
            const items = groups.get(name) ?? [];
            items.push(node);
            groups.set(name, items);
        }

        for (const [name, items] of groups) tree.appendChild(this.renderGroup(name, items));
        this.host.appendChild(tree);
        this.applyFilter();
        this.syncSelectionClass();
    }

    private reconcileSelection(): void {
        if (this.selectedTypeId === null || this.visibleNodeType(this.selectedTypeId) !== null) return;
        this.selectedTypeId = null;
        this.emit('selectionChanged', { node: null });
    }

    private renderGroup(name: string, items: Node[]): HTMLElement {
        const li = document.createElement('li');
        li.className = 'd-palette-group';
        li.dataset.group = name;
        li.dataset.search = name.toLowerCase();
        li.setAttribute('role', 'treeitem');

        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'd-palette-group-head';
        head.setAttribute('aria-expanded', String(!this.collapsed.has(name)));

        const chev = document.createElement('span');
        chev.className = 'd-palette-chev';
        chev.setAttribute('aria-hidden', 'true');

        const label = document.createElement('span');
        label.className = 'd-palette-group-name';
        label.textContent = name;

        head.appendChild(chev);
        head.appendChild(label);
        head.addEventListener('click', () => {
            if (this.collapsed.has(name)) this.collapsed.delete(name);
            else this.collapsed.add(name);
            this.applyFilter();
        });

        const list = document.createElement('ul');
        list.className = 'd-palette-group-items';
        list.setAttribute('role', 'group');
        for (const item of items) list.appendChild(this.renderItem(item));

        li.appendChild(head);
        li.appendChild(list);
        return li;
    }

    private renderItem(item: Node): HTMLElement {
        const li = document.createElement('li');
        li.className = 'd-palette-item';
        li.draggable = true;
        li.tabIndex = 0;
        li.dataset.typeId = item.id;
        li.dataset.search = `${item.name} ${item.description}`.trim().toLowerCase();
        li.title = item.description.length > 0 ? `${item.name} — ${item.description}` : item.name;
        li.setAttribute('role', 'treeitem');
        li.setAttribute('aria-selected', 'false');

        if (item.icon.length > 0) {
            const img = document.createElement('img');
            img.className = 'd-palette-icon';
            img.src = item.icon;
            img.alt = '';
            li.appendChild(img);
        } else {
            const placeholder = document.createElement('span');
            placeholder.className = 'd-palette-icon d-palette-icon-placeholder';
            placeholder.setAttribute('aria-hidden', 'true');
            li.appendChild(placeholder);
        }

        const label = document.createElement('span');
        label.className = 'd-palette-label';
        label.textContent = item.name;
        li.appendChild(label);

        li.addEventListener('click', () => this.selectNodeType(item.id));
        li.addEventListener('dblclick', (event) => {
            event.preventDefault();
            this.selectNodeType(item.id);
            this.emit('nodeActivated', { node: item.clone() });
        });
        li.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            this.selectNodeType(item.id);
            this.emit('nodeActivated', { node: item.clone() });
        });
        li.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            this.selectNodeType(item.id);
            this.emit('contextMenuRequested', {
                node: item.clone(),
                x: event.clientX,
                y: event.clientY,
            });
        });
        li.addEventListener('dragstart', (event) => {
            if (event.dataTransfer === null) return;
            this.selectNodeType(item.id);
            event.dataTransfer.effectAllowed = 'copy';
            event.dataTransfer.setData(PALETTE_DRAG_MIME, JSON.stringify({ typeId: item.id }));
            event.dataTransfer.setData('text/plain', item.id);
            li.classList.add('is-dragging');
        });
        li.addEventListener('dragend', () => li.classList.remove('is-dragging'));

        return li;
    }

    private applyFilter(): void {
        const filtering = this.filter.length > 0;
        for (const group of Array.from(this.host.querySelectorAll<HTMLElement>('.d-palette-group'))) {
            const groupMatches = filtering && (group.dataset.search ?? '').includes(this.filter);
            let groupVisible = false;
            for (const item of Array.from(group.querySelectorAll<HTMLElement>('.d-palette-item'))) {
                const matches = !filtering || groupMatches || (item.dataset.search ?? '').includes(this.filter);
                item.classList.toggle('is-hidden', !matches);
                if (matches) groupVisible = true;
            }
            group.classList.toggle('is-hidden', !groupVisible);
            const collapsed = !filtering && this.collapsed.has(group.dataset.group ?? '');
            group.classList.toggle('is-collapsed', collapsed);
            group.querySelector<HTMLButtonElement>('.d-palette-group-head')
                ?.setAttribute('aria-expanded', String(!collapsed));
        }
    }

    private syncSelectionClass(): void {
        for (const item of Array.from(this.host.querySelectorAll<HTMLElement>('.d-palette-item'))) {
            const selected = normalizeTypeId(item.dataset.typeId ?? '') === this.selectedTypeId;
            item.classList.toggle('is-selected', selected);
            item.setAttribute('aria-selected', String(selected));
        }
    }
}

function groupNameOf(node: Node): string {
    return node.groupName.length > 0 ? node.groupName : 'Common';
}

function normalizeTypeId(typeId: string): string {
    return typeId.toLowerCase();
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
    return left.size === right.size && [...left].every((value) => right.has(value));
}
