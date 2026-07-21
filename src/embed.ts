// Shared read-only diagram embed layer. Rendering, palette loading and theming
// live next to the diagram engine so web applications do not copy that logic.
//
// renderScheme draws a scheme supplied by the caller. renderAll,
// renderFromSource and renderFromInline discover .ss-diagram-host elements and
// load a schema from a URL or embedded JSON. Every failure degrades to a short
// inline note instead of throwing.
// StockSharpDiagram imports the compatibility runtime explicitly, so a bundle
// containing this module is self-contained and does not require a preceding
// window.go script.
import { StockSharpDiagram } from './diagram/diagram.js';
import { StockSharpCatalog } from './diagram/catalog.js';
import { DiagramNode, Link, Node, Port, PortType } from './diagram/types.js';

interface PalettePort {
	key: string;
	name: string;
	type: string;
	maxLinks?: number;
	availableTypes?: string[];
	isDynamic?: boolean;
	dynamicMode?: string;
}

interface PaletteElement {
	typeId: string;
	name: string;
	groupName: string;
	icon: string;
	inPorts: PalettePort[];
	outPorts: PalettePort[];
}

interface Palette {
	socketTypes: { name: string; color: string }[];
	elements: PaletteElement[];
}

interface SchemeNode { id: string; typeId: string; name: string; x: number; y: number; }
interface SchemeLink { from: string; fromPort: string; to: string; toPort: string; }
interface Scheme { nodes: SchemeNode[]; links: SchemeLink[]; }

const PALETTE_URL = '/data/designer-palette.json';

function iconUrl(name: string): string {
	return name ? `/diagram-icons/${name}.svg` : '';
}

// Perceived luminance (0..255) of a #rrggbb colour; used to tell a light diagram canvas from a dark
// one so the (dark-canvas-tuned) link palette can be darkened when the canvas is light.
function luminance(hex: string): number {
	const m = hex.match(/^#?([0-9a-fA-F]{6})$/);
	if (m === null)
		return 0;
	const n = parseInt(m[1], 16);
	return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

function makePort(p: PalettePort): Port {
	return new Port({
		id: p.key,
		name: p.name,
		type: p.type,
		maxLinks: p.maxLinks ?? 0,
		availableTypes: p.availableTypes ?? [],
		isDynamic: p.isDynamic ?? false,
		dynamicMode: p.dynamicMode ?? '',
	});
}

function buildCatalog(palette: Palette): StockSharpCatalog {
	const catalog = new StockSharpCatalog();

	for (const st of palette.socketTypes)
		catalog.addPortType(new PortType({ name: st.name, color: st.color }));

	for (const el of palette.elements) {
		catalog.addNodeType(new Node({
			id: el.typeId,
			name: el.name,
			groupName: el.groupName,
			icon: iconUrl(el.icon),
			inPorts: el.inPorts.map(makePort),
			outPorts: el.outPorts.map(makePort),
		}));
	}

	return catalog;
}

function toDiagramNodes(scheme: Scheme, catalog: StockSharpCatalog): DiagramNode[] {
	const portOf = (p: Port) => ({ id: p.id, name: p.name, type: p.type, maxLinks: p.maxLinks });

	const usedIn = new Map<string, Set<string>>();
	const usedOut = new Map<string, Set<string>>();
	const add = (m: Map<string, Set<string>>, id: string, port: string) => {
		(m.get(id) ?? m.set(id, new Set()).get(id)!).add(port);
	};
	for (const l of scheme.links) {
		add(usedOut, l.from, l.fromPort);
		add(usedIn, l.to, l.toPort);
	}

	return scheme.nodes.map((n) => {
		const t = catalog.getNodeType(n.typeId);
		const inPorts = t ? t.inPorts.map(portOf) : [];
		const outPorts = t ? t.outPorts.map(portOf) : [];
		const anchorType = (t?.inPorts.find((p) => p.isDynamic)?.type) ?? 'Any';

		for (const key of usedIn.get(n.id) ?? [])
			if (!inPorts.some((p) => p.id === key))
				inPorts.push({ id: key, name: key, type: anchorType, maxLinks: 0 });

		for (const key of usedOut.get(n.id) ?? [])
			if (!outPorts.some((p) => p.id === key))
				outPorts.push({ id: key, name: key, type: 'Any', maxLinks: 0 });

		const data = new DiagramNode({ id: n.id, typeId: n.typeId, name: n.name, x: n.x, y: n.y, inPorts, outPorts });

		if (t?.icon)
			data.icon = t.icon;

		if (!t) {
			data.color = '#5a3030';
			data.border = '#a04040';
		}

		return data;
	});
}

// Walk the persisted Content.Value.Scheme.Model.{Nodes,Links} structure into
// the thin scheme. Defensive at every field so a partially
// broken document yields as many nodes as are readable; a wholly unusable one yields an empty scheme.
function nodeName(node: Record<string, unknown>): string {
	const settings = node?.Settings as Record<string, unknown> | undefined;
	const parameters = settings?.Parameters as Record<string, unknown> | undefined;
	const nameParam = parameters?.Name as Record<string, unknown> | undefined;
	const nameVal = nameParam?.Value;
	if (typeof nameVal === 'string' && nameVal.length > 0)
		return nameVal;
	if (typeof node?.Figure === 'string' && (node.Figure as string).length > 0)
		return node.Figure as string;
	return typeof node?.Key === 'string' ? node.Key as string : '';
}

function parseRawScheme(raw: unknown): Scheme {
	const nodes: SchemeNode[] = [];
	const links: SchemeLink[] = [];

	const root = raw as Record<string, unknown>;
	const content = root?.Content as Record<string, unknown> | undefined;
	const value = content?.Value as Record<string, unknown> | undefined;
	const scheme = value?.Scheme as Record<string, unknown> | undefined;
	const model = scheme?.Model as Record<string, unknown> | undefined;
	if (!model)
		return { nodes, links };

	for (const raw of (model.Nodes as Record<string, unknown>[] ?? [])) {
		const key = raw?.Key;
		if (typeof key !== 'string' || key.length === 0)
			continue;
		nodes.push({
			id: key,
			typeId: typeof raw.TypeId === 'string' ? raw.TypeId : '',
			name: nodeName(raw),
			x: typeof raw.X === 'number' ? raw.X : 0,
			y: typeof raw.Y === 'number' ? raw.Y : 0,
		});
	}

	for (const raw of (model.Links as Record<string, unknown>[] ?? [])) {
		const from = raw?.From;
		const to = raw?.To;
		if (typeof from !== 'string' || typeof to !== 'string')
			continue;
		links.push({
			from,
			fromPort: typeof raw.FromPort === 'string' ? raw.FromPort : '',
			to,
			toPort: typeof raw.ToPort === 'string' ? raw.ToPort : '',
		});
	}

	return { nodes, links };
}

export async function renderScheme(div: HTMLElement, paletteUrl: string, scheme: Scheme): Promise<void> {
	const palette = (await fetch(paletteUrl).then((r) => r.json())) as Palette;
	const catalog = buildCatalog(palette);

	const diagram = new StockSharpDiagram({ div, catalog });

	// Follow the site theme: the canvas colour comes from the live --diagram-bg CSS token; a theme toggle
	// repaints it. Nodes are self-contained light-grey boxes, so only the canvas behind them is themed.
	const applyDiagramTheme = () => {
		const cs = getComputedStyle(document.documentElement);
		const bg = cs.getPropertyValue('--diagram-bg').trim() || '#1b1b1f';
		const gridColor = cs.getPropertyValue('--diagram-grid').trim() || '#26262c';
		diagram.setTheme({
			diagramBackground: bg,
			gridColor,
			linkMaxLightness: luminance(bg) > 140 ? 0.42 : 1,
		});
	};
	applyDiagramTheme();
	new MutationObserver(applyDiagramTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
	diagram.setReadOnly(true);

	diagram.setLinkValidator(() => true);
	diagram.setOverviewVisible(false);
	diagram.load(
		toDiagramNodes(scheme, catalog),
		scheme.links.map((link) => new Link({
			outNode: link.from,
			outPort: link.fromPort,
			inNode: link.to,
			inPort: link.toPort,
		})),
	);

	const fit = () => {
		const w = div.clientWidth, h = div.clientHeight;
		if (w < 2 || h < 2)
			return;
		diagram.resize(w, h);
		diagram.zoomToFit();
	};

	setTimeout(fit, 0);

	let scheduled = false;
	const observer = new ResizeObserver(() => {
		if (scheduled)
			return;
		scheduled = true;
		setTimeout(() => { scheduled = false; fit(); }, 50);
	});
	observer.observe(div);

	const wrap = div.closest('.ss-expandable');
	if (wrap) {
		const classObserver = new MutationObserver(() => setTimeout(fit, 60));
		classObserver.observe(wrap, { attributes: true, attributeFilter: ['class'] });
	}
}

function note(div: HTMLElement, message: string): void {
	div.textContent = message;
	div.classList.add('ss-diagram-error');
}

// Fetch the raw schema JSON from srcUrl, transform it and draw it. Every failure mode -- an
// unreachable source, a non-JSON / malformed body, or an empty schema -- degrades to a short inline note
// instead of throwing, so a bad @diagram never breaks the surrounding page.
export async function renderFromSource(div: HTMLElement, paletteUrl: string, srcUrl: string): Promise<void> {
	const errors = (div.dataset.diagramErrors ?? '').split('|');
	const [errLoad = 'Diagram source could not be loaded.', errEmpty = 'Diagram is empty or malformed.', errDraw = 'Diagram could not be rendered.'] = errors;

	let raw: unknown;
	try {
		const resp = await fetch(srcUrl);
		if (!resp.ok) { note(div, errLoad); return; }
		const text = (await resp.text()).replace(/^﻿/, '');
		raw = JSON.parse(text);
	} catch {
		note(div, errLoad);
		return;
	}

	const scheme = parseRawScheme(raw);
	if (scheme.nodes.length === 0) {
		note(div, errEmpty);
		return;
	}

	try {
		await renderScheme(div, paletteUrl, scheme);
	} catch {
		note(div, errDraw);
	}
}

// Draw a host whose schema JSON is embedded inline (a
// <script type="application/json"> child holds the schema). Same degradation as renderFromSource: a
// malformed/empty schema shows an inline note instead of throwing.
export async function renderFromInline(div: HTMLElement, paletteUrl: string, json: string): Promise<void> {
	const errors = (div.dataset.diagramErrors ?? '').split('|');
	const [, errEmpty = 'Diagram is empty or malformed.', errDraw = 'Diagram could not be rendered.'] = errors;

	let raw: unknown;
	try {
		raw = JSON.parse(json);
	} catch {
		note(div, errEmpty);
		return;
	}

	const scheme = parseRawScheme(raw);
	if (scheme.nodes.length === 0) {
		note(div, errEmpty);
		return;
	}

	try {
		await renderScheme(div, paletteUrl, scheme);
	} catch {
		note(div, errDraw);
	}
}

// Render every not-yet-rendered diagram host under root (default: the whole document). Callable again after
// dynamic HTML is injected (e.g. the editor preview) to draw hosts that just appeared. A host either points
// at a source URL (data-diagram-src) or embeds its schema JSON inline (a <script type="application/json">).
export function renderAll(root: ParentNode = document): void {
	root.querySelectorAll<HTMLElement>('.ss-diagram-host').forEach((host) => {
		if (host.dataset.rendered === '1')
			return;

		const src = host.dataset.diagramSrc;
		if (src) {
			host.dataset.rendered = '1';
			void renderFromSource(host, PALETTE_URL, src);
			return;
		}

		const inline = host.querySelector('script[type="application/json"]');
		if (inline) {
			host.dataset.rendered = '1';
			void renderFromInline(host, PALETTE_URL, inline.textContent ?? '');
		}
	});
}
