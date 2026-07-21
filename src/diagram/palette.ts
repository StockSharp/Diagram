import { StockSharpCatalog } from './catalog.js';
import { Node } from './types.js';

export interface PaletteOptions {
    div: HTMLElement;
    catalog: StockSharpCatalog;
}

/// HTML/CSS palette — replaces a canvas-rendered Palette so the tree
/// fully follows our theme tokens (light/dark) and renders accessible HTML
/// instead of a canvas. Drag-from-palette is wired through native HTML5
/// drag-and-drop: items set a typeId payload on dragstart, and the
/// diagram host (StockSharpDiagram.dropNodeAt) consumes the drop and
/// adds the catalog-resolved node to its model.
///
/// Mime type used on the DataTransfer payload — same string is read on
/// the diagram side in main.ts.
export const PALETTE_DRAG_MIME = 'application/x-stocksharp-node';

export class StockSharpPalette {
    private readonly host: HTMLElement;
    private readonly catalog: StockSharpCatalog;
    private filter = '';
    private collapsed = new Set<string>();

    constructor({ div, catalog }: PaletteOptions) {
        this.host = div;
        this.host.classList.add('d-palette');
        this.host.setAttribute('role', 'tree');
        this.catalog = catalog;
        this.catalog.on('nodeTypesChanged', () => this.render());
        this.render();
    }

    setFilter(text: string): void {
        this.filter = (text ?? '').trim().toLowerCase();
        this.applyFilter();
    }

    collapseAll(): void {
        // Pre-mark every group as collapsed before render — then render
        // will honour the set.
        for (const groupName of this.groupNames()) {
            this.collapsed.add(groupName);
        }
        this.syncCollapsedClass();
    }

    expandAll(): void {
        this.collapsed.clear();
        this.syncCollapsedClass();
    }

    private groupNames(): Set<string> {
        const set = new Set<string>();
        for (const node of this.catalog.getNodeTypes()) {
            set.add(node.groupName.length > 0 ? node.groupName : 'Common');
        }
        return set;
    }

    private render(): void {
        this.host.innerHTML = '';
        const tree = document.createElement('ul');
        tree.className = 'd-palette-tree';

        const groups = new Map<string, Node[]>();
        for (const node of this.catalog.getNodeTypes()) {
            const name = node.groupName.length > 0 ? node.groupName : 'Common';
            if (!groups.has(name)) groups.set(name, []);
            groups.get(name)!.push(node);
        }

        for (const [name, items] of groups) {
            tree.appendChild(this.renderGroup(name, items));
        }
        this.host.appendChild(tree);
        this.applyFilter();
    }

    private renderGroup(name: string, items: Node[]): HTMLElement {
        const li = document.createElement('li');
        li.className = 'd-palette-group';
        li.dataset.group = name;
        if (this.collapsed.has(name)) li.classList.add('is-collapsed');

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
            li.classList.toggle('is-collapsed', this.collapsed.has(name));
            head.setAttribute('aria-expanded', String(!this.collapsed.has(name)));
        });

        const list = document.createElement('ul');
        list.className = 'd-palette-group-items';
        for (const item of items) {
            list.appendChild(this.renderItem(item));
        }

        li.appendChild(head);
        li.appendChild(list);
        return li;
    }

    private renderItem(item: Node): HTMLElement {
        const li = document.createElement('li');
        li.className = 'd-palette-item';
        li.draggable = true;
        li.dataset.typeId = item.id;
        li.dataset.name = item.name.toLowerCase();
        li.title = item.description.length > 0 ? `${item.name} — ${item.description}` : item.name;

        if (item.icon.length > 0) {
            const img = document.createElement('img');
            img.className = 'd-palette-icon';
            img.src = item.icon;
            img.alt = '';
            li.appendChild(img);
        } else {
            const ph = document.createElement('span');
            ph.className = 'd-palette-icon d-palette-icon-placeholder';
            ph.setAttribute('aria-hidden', 'true');
            li.appendChild(ph);
        }

        const label = document.createElement('span');
        label.className = 'd-palette-label';
        label.textContent = item.name;
        li.appendChild(label);

        li.addEventListener('dragstart', (e) => {
            if (e.dataTransfer === null) return;
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData(PALETTE_DRAG_MIME, JSON.stringify({ typeId: item.id }));
            // Plain text fallback so misbehaving listeners don't reject — the
            // diagram drop handler only reads the typed mime above.
            e.dataTransfer.setData('text/plain', item.id);
            li.classList.add('is-dragging');
        });
        li.addEventListener('dragend', () => {
            li.classList.remove('is-dragging');
        });

        return li;
    }

    private applyFilter(): void {
        for (const group of Array.from(this.host.querySelectorAll<HTMLElement>('.d-palette-group'))) {
            let groupVisible = false;
            for (const item of Array.from(group.querySelectorAll<HTMLElement>('.d-palette-item'))) {
                const name = item.dataset.name ?? '';
                const matches = this.filter.length === 0 || name.includes(this.filter);
                item.classList.toggle('is-hidden', !matches);
                if (matches) groupVisible = true;
            }
            group.classList.toggle('is-hidden', !groupVisible);
            // When filtering, force-expand groups so matched items are
            // visible without the user clicking to open each.
            if (this.filter.length > 0 && groupVisible) {
                group.classList.remove('is-collapsed');
            }
        }
    }

    private syncCollapsedClass(): void {
        for (const group of Array.from(this.host.querySelectorAll<HTMLElement>('.d-palette-group'))) {
            const name = group.dataset.group ?? '';
            const c = this.collapsed.has(name);
            group.classList.toggle('is-collapsed', c);
            const head = group.querySelector<HTMLButtonElement>('.d-palette-group-head');
            head?.setAttribute('aria-expanded', String(!c));
        }
    }
}
