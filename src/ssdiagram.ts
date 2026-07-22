// ssdiagram.ts — Layer-B (`window.go` namespace) compatibility shim on
// top of the in-house ssgraph engine.
//
// This exists for integrations written against an older declarative diagram surface
// (`go.GraphObject.make`, `go.Diagram`, `go.Binding`, `go.Point`,
// `go.Spot`, `go.Panel`, `go.GraphLinksModel`, `go.Adornment`,
// `go.Overview`, …). Rewriting the call sites to the Layer-A
// `StockSharpDiagram` surface is a separate, larger task. This shim
// lets them run on ssgraph without rewriting every call site at once.
//
// Approach: ssgraph is procedural — its `Diagram` class renders nodes/
// links/ports from its own model. The legacy declarative templates
// assembled by diagram.ts (`nodeTemplate`, `linkTemplate`, port
// templates, adornments) are NOT honoured here — they become inert
// tree descriptors that diagram.ts can set and forget. The bridge
// that matters is:
//
//   * `new go.Diagram(div, opts)` constructs an ssgraph.Diagram and
//     returns a wrapper that exposes `model`, `commandHandler`,
//     `toolManager`, `selection`, `nodes`, `links`, `addDiagramListener`,
//     `addModelChangedListener`, `findNodeForKey`, etc.
//   * `model.addNodeData` / `addLinkData` / `removeNodeData` /
//     `removeLinkData` / `insertArrayItem` / `removeArrayItem` /
//     `setDataProperty` translate to ssgraph mutations and emit
//     legacy-shaped `ChangedEvent`s through `addModelChangedListener`.
//   * `toolManager.linkingTool.linkValidation` and
//     `toolManager.relinkingTool.linkValidation` callbacks are
//     installed as a single `setLinkValidator` on ssgraph.
//   * `commandHandler` (undo/redo/cut/copy/paste/deleteSelection/
//     zoomToFit + canX queries) forwards to ssgraph's matching methods.
//
// Things that DON'T faithfully render through this shim:
//   - Custom node/link templates: ssgraph paints its own boxes & ports.
//     `color` / `border` / port `type` flow through via setDataProperty
//     into the ssgraph model so per-node fills + per-port hue work, but
//     custom Pictures/TextBlocks/Adornments inside templates are
//     ignored.
//   - Custom contextMenu Adornment: ssgraph emits its own
//     `contextMenu` event that the host can render in DOM. The legacy
//     `installContextMenu` override path in diagram.ts is bypassed.
//   - Two-way `Binding` (e.g. link `points` reshape) — links route
//     procedurally; reshape persistence is unimplemented.
//   - Overview minimap — ssgraph has its own built-in overview
//     painted on the same canvas; the secondary `overviewDiv` host
//     stays empty.
//   - `findObject('MESSAGE')` / `findObject('BOX')` — return null.
//
// Standalone build outputs:
//   - `dist/ssdiagram.js` includes this runtime and the complete public stack.
//   - `dist/ssdiagram-legacy.js` contains only this compatibility layer.
// Existing separately compiled call sites can still resolve `window.go.*`
// through the compatibility-only bundle.

import { Diagram as SsDiagram, LinkModel, NodeModel, PortModel } from './ssgraph.js';
import type { LinkInit, DiagramNodeInit, PortInit, LinkValidatorArgs } from './ssgraph.js';

// ---------------------------------------------------------------------
// Value-class stubs for `go.Point` / `go.Size` / `go.Spot` / `go.Margin`.
// Plain data with the right shape; diagram.ts only reads .x/.y/.width/
// .height after construction.
// ---------------------------------------------------------------------

class Point {
	x: number;
	y: number;
	constructor(x: number = 0, y: number = 0) { this.x = x; this.y = y; }
	static parse(s: string): Point {
		const parts = String(s).trim().split(/\s+/);
		const x = parts.length > 0 ? Number(parts[0]) : 0;
		const y = parts.length > 1 ? Number(parts[1]) : 0;
		return new Point(isFinite(x) ? x : 0, isFinite(y) ? y : 0);
	}
	static stringify(p: Point): string { return `${p.x} ${p.y}`; }
}

class Size {
	width: number;
	height: number;
	constructor(w: number = NaN, h: number = NaN) { this.width = w; this.height = h; }
}

class Margin {
	top: number; right: number; bottom: number; left: number;
	constructor(t: number = 0, r?: number, b?: number, l?: number) {
		this.top = t;
		this.right = r === undefined ? t : r;
		this.bottom = b === undefined ? t : b;
		this.left = l === undefined ? (r === undefined ? t : r) : l;
	}
}

// Spots encode an alignment + offset inside a parent. We only need
// a handful of singletons + constructor support so diagram.ts can pass
// them around as opaque tokens.
class Spot {
	x: number; y: number; offsetX: number; offsetY: number;
	constructor(x: number = 0.5, y: number = 0.5, ox: number = 0, oy: number = 0) {
		this.x = x; this.y = y; this.offsetX = ox; this.offsetY = oy;
	}
	static Center: Spot;
	static Left: Spot;
	static Right: Spot;
	static Top: Spot;
	static Bottom: Spot;
}
Spot.Center = new Spot(0.5, 0.5, 0, 0);
Spot.Left   = new Spot(0,   0.5, 0, 0);
Spot.Right  = new Spot(1,   0.5, 0, 0);
Spot.Top    = new Spot(0.5, 0,   0, 0);
Spot.Bottom = new Spot(0.5, 1,   0, 0);

// ---------------------------------------------------------------------
// Binding — opaque descriptor. diagram.ts builds bindings, hands them
// to GraphObject.make, and never reads them back. Stored on the host
// GraphObject for potential later evaluation; currently not evaluated.
// ---------------------------------------------------------------------

class Binding {
	target: string;
	source: string;
	converter: ((value: unknown, target?: unknown) => unknown) | undefined;
	twoWaySerializer: ((v: unknown) => unknown) | undefined;
	constructor(target: string, source?: string, converter?: (value: unknown, target?: unknown) => unknown) {
		this.target = target;
		this.source = source ?? '';
		this.converter = converter;
		this.twoWaySerializer = undefined;
	}
	makeTwoWay(serializer?: (v: unknown) => unknown): Binding {
		this.twoWaySerializer = serializer;
		return this;
	}
}

// ---------------------------------------------------------------------
// GraphObject hierarchy — pure data carriers. Templates assembled with
// GraphObject.make build a tree of these, but ssgraph never executes
// the tree; it paints from its own model. Marker classes so
// `instanceof go.Node` / `instanceof go.Link` checks in diagram.ts
// keep working.
// ---------------------------------------------------------------------

class GraphObject {
	// Mirrors the legacy ambient typings — readers of these properties
	// in diagram.ts get the same shape they did under the original
	// declarative engine, just without the live rendering.
	part: Part | null = null;
	panel: Panel | null = null;
	data: unknown = null;
	background: string | null = null;
	// Used by diagram.ts at template-assembly time to stash arbitrary
	// fields (figure, fill, stroke, font, etc.). Never read again.
	[key: string]: unknown;
}
// Stretch enums + horizontal / vertical layout tokens live on
// GraphObject itself in the legacy surface. diagram.ts reads these
// through awkward `(go as unknown as { GraphObject: { Fill: unknown } })`
// casts — we just need any truthy value.
(GraphObject as unknown as { Fill: unknown }).Fill = 'fill';
(GraphObject as unknown as { Uniform: unknown }).Uniform = 'uniform';
(GraphObject as unknown as { Horizontal: unknown }).Horizontal = 'horizontal';
(GraphObject as unknown as { Vertical: unknown }).Vertical = 'vertical';

class Panel extends GraphObject {}
class Placeholder extends GraphObject {}
class TextBlock extends GraphObject {
	static WrapFit: unknown = 'WrapFit';
}
class Picture extends GraphObject {}
class Shape extends GraphObject {
	figure: string = '';
	fill: string | null = null;
	stroke: string | null = null;
	strokeWidth: number = 1;
}
class Group extends GraphObject {}

class GridLayout {
	static Position: unknown = 'Position';
}

class Part extends GraphObject {
	location: Point = new Point();
	isSelected: boolean = false;
	findObject(_name: string): GraphObject | null { return null; }
}
class Node extends Part {}
class Link extends Part {
	static AvoidsNodes: unknown = 'AvoidsNodes';
	static JumpOver: unknown = 'JumpOver';
}
class Adornment extends Part {}

class ChangedEvent {
	change: unknown;
	modelChange: string;
	oldValue: unknown;
	newValue: unknown;
	isTransactionFinished: boolean;
	static Insert: unknown = 'Insert';
	static Remove: unknown = 'Remove';
	constructor(change: unknown, modelChange: string, oldValue: unknown, newValue: unknown, isTransactionFinished: boolean) {
		this.change = change;
		this.modelChange = modelChange;
		this.oldValue = oldValue;
		this.newValue = newValue;
		this.isTransactionFinished = isTransactionFinished;
	}
}

// ---------------------------------------------------------------------
// "Live" Node / Link wrappers handed back to diagram.ts callers via
// findNodeForKey, selection iteration, links.each, etc. They carry a
// reference to the underlying ssgraph model so diagram.ts's mutations
// (e.g. setting location, calling remove(part)) can be translated.
// ---------------------------------------------------------------------

class LiveNode extends Node {
	readonly key: string;
	readonly _bridge: ModelBridge;
	constructor(bridge: ModelBridge, data: unknown, key: string) {
		super();
		this._bridge = bridge;
		this.key = key;
		this.data = data;
		this.location = new Point(0, 0);
	}
}

class LiveLink extends Link {
	readonly _bridge: ModelBridge;
	constructor(bridge: ModelBridge, data: unknown) {
		super();
		this._bridge = bridge;
		this.data = data;
	}
}

// ---------------------------------------------------------------------
// GraphObject.make — variadic declarative factory. We accept everything
// the legacy templates throw at us:
//   - first arg is a constructor (Node/Link/Panel/Shape/...) OR a
//     string name (panel type 'Auto' / 'Vertical' / template alias).
//   - remaining args are property-bag objects, Bindings, child
//     GraphObjects, primitives, or — for the special `(go.Diagram, div,
//     opts)` / `(go.Overview, div, opts)` / `(go.Palette, div, opts)`
//     paths — the host element + an options bag.
// ---------------------------------------------------------------------

interface GMakeCtor<T> { new(...args: unknown[]): T }

function gMake(type: unknown, ...args: unknown[]): unknown {
	// (go.Diagram, host, options) → live Diagram wrapper.
	if (type === Diagram) {
		const host = args[0] as HTMLElement;
		const opts = (args[1] as Record<string, unknown>) ?? {};
		return new Diagram(host, opts);
	}
	if (type === Overview) {
		const host = args[0] as HTMLElement;
		const opts = (args[1] as Record<string, unknown>) ?? {};
		return new Overview(host, opts);
	}
	if (type === Palette) {
		const host = args[0] as HTMLElement;
		const opts = (args[1] as Record<string, unknown>) ?? {};
		return new Palette(host, opts);
	}
	let obj: GraphObject;
	if (typeof type === 'function') {
		const Ctor = type as GMakeCtor<GraphObject>;
		obj = new Ctor();
	} else {
		// String form ('Auto', 'Vertical', 'ContextMenuButton', ...) —
		// no semantic difference to us; everything becomes a Panel-ish
		// container.
		obj = new Panel();
		(obj as unknown as { _kind: unknown })._kind = type;
	}
	const bindings: Binding[] = [];
	const children: GraphObject[] = [];
	let firstString: string | null = null;
	for (const a of args) {
		if (a === null || a === undefined) continue;
		if (a instanceof Binding) { bindings.push(a); continue; }
		if (a instanceof GraphObject) { children.push(a); continue; }
		if (typeof a === 'string') {
			// First string slot is the panel-type / figure name in the
			// declarative surface. diagram.ts uses this for
			// 'RoundedRectangle', 'Rectangle', 'Auto', 'Vertical',
			// 'Horizontal', etc.
			if (firstString === null) { firstString = a; }
			else {
				// Second string = TextBlock text content in `$(go.TextBlock, glyph, …)`.
				(obj as unknown as { text: unknown }).text = a;
			}
			continue;
		}
		if (typeof a === 'object') {
			Object.assign(obj as unknown as Record<string, unknown>, a as Record<string, unknown>);
			continue;
		}
	}
	if (firstString !== null) {
		// Shape `figure` vs Panel `kind`. The right slot depends on the
		// object class; assign both — diagram.ts only reads what makes
		// sense per ctor.
		(obj as unknown as { figure: unknown }).figure = firstString;
		(obj as unknown as { _kind: unknown })._kind = firstString;
	}
	(obj as unknown as { _bindings: Binding[] })._bindings = bindings;
	(obj as unknown as { _children: GraphObject[] })._children = children;
	return obj;
}

// ---------------------------------------------------------------------
// Model bridge — owns the legacy-shaped `nodeDataArray` /
// `linkDataArray` AND the live ssgraph instance, keeps them in sync,
// and fans mutations out to model-change listeners as ChangedEvents.
// ---------------------------------------------------------------------

type NodeDataAny = Record<string, unknown> & { id: string; loc?: string; inPorts?: PortDataAny[]; outPorts?: PortDataAny[]; color?: string; border?: string };
type LinkDataAny = Record<string, unknown> & { from: string; fromPort: string; to: string; toPort: string };
type PortDataAny = Record<string, unknown> & { id: string; name?: string; type?: string; maxLinks?: number; direction?: string };

class GraphLinksModel {
	nodeKeyProperty: string = 'key';
	nodeGroupKeyProperty: string = 'group';
	linkFromPortIdProperty: string = '';
	linkToPortIdProperty: string = '';
	nodeDataArray: NodeDataAny[] = [];
	linkDataArray: LinkDataAny[] = [];
	_bridge: ModelBridge | null = null;

	addNodeData(data: NodeDataAny): void {
		this.nodeDataArray.push(data);
		this._bridge?.onNodeInserted(data, false);
	}
	removeNodeData(data: NodeDataAny): void {
		const idx = this.nodeDataArray.indexOf(data);
		if (idx < 0) return;
		this.nodeDataArray.splice(idx, 1);
		this._bridge?.onNodeRemoved(data, false);
	}
	addLinkData(data: LinkDataAny): void {
		this.linkDataArray.push(data);
		this._bridge?.onLinkInserted(data, false);
	}
	removeLinkData(data: LinkDataAny): void {
		const idx = this.linkDataArray.indexOf(data);
		if (idx < 0) return;
		this.linkDataArray.splice(idx, 1);
		this._bridge?.onLinkRemoved(data, false);
	}
	setDataProperty(data: Record<string, unknown>, name: string, value: unknown): void {
		data[name] = value;
		this._bridge?.onDataPropertyChanged(data, name, value);
	}
	insertArrayItem(arr: unknown[], index: number, value: unknown): void {
		arr.splice(index, 0, value);
		this._bridge?.onPortArrayMutated(arr);
	}
	removeArrayItem(arr: unknown[], index: number): void {
		arr.splice(index, 1);
		this._bridge?.onPortArrayMutated(arr);
	}
}

class ModelBridge {
	readonly diagram: Diagram;
	readonly ss: SsDiagram;
	model: GraphLinksModel;
	private modelListeners: Array<(evt: ChangedEvent) => void> = [];
	// Diagram listeners are keyed by legacy event name —
	// 'SelectionMoved', 'ExternalObjectsDropped', 'ViewportBoundsChanged'.
	private diagramListeners = new Map<string, Array<(evt: { subject: { each: (cb: (part: unknown) => void) => void } }) => void>>();
	// Re-entrancy guard: when ssgraph fires nodeAdded because we just
	// called ss.addDiagramNode in response to model.addNodeData, we
	// must NOT re-add to the model array — would dupe the entry.
	private syncingFromSs: boolean = false;
	// All known live wrappers, by id, so callers always get the same
	// reference for the same node.
	private liveNodes = new Map<string, LiveNode>();
	private liveLinks = new Map<string, LiveLink>();

	constructor(diagram: Diagram, ss: SsDiagram, model: GraphLinksModel) {
		this.diagram = diagram;
		this.ss = ss;
		this.model = model;
		this.attachModel(model, false);

		// ssgraph → legacy-shaped event re-fanout. Anything that mutated
		// ssgraph directly (drag-to-link, delete via keyboard) must
		// also reach the model arrays so the host's onModelChanged
		// pipeline sees it.
		ss.on('nodeAdded', (e) => {
			if (this.syncingFromSs) return;
			const data = this.nodeModelToData(e.node);
			this.model.nodeDataArray.push(data);
			this.fireChange(ChangedEvent.Insert, 'nodeDataArray', null, data, true);
		});
		ss.on('nodeRemoved', (e) => {
			if (this.syncingFromSs) return;
			const idx = this.model.nodeDataArray.findIndex((d) => d.id === e.node.id);
			if (idx < 0) return;
			const data = this.model.nodeDataArray[idx];
			this.model.nodeDataArray.splice(idx, 1);
			this.fireChange(ChangedEvent.Remove, 'nodeDataArray', data, null, true);
		});
		ss.on('linkAdded', (e) => {
			if (this.syncingFromSs) return;
			const data: LinkDataAny = { from: e.link.from, fromPort: e.link.fromPort, to: e.link.to, toPort: e.link.toPort };
			this.model.linkDataArray.push(data);
			this.fireChange(ChangedEvent.Insert, 'linkDataArray', null, data, true);
		});
		ss.on('linkRemoved', (e) => {
			if (this.syncingFromSs) return;
			const idx = this.model.linkDataArray.findIndex((d) => d.from === e.link.from && d.fromPort === e.link.fromPort && d.to === e.link.to && d.toPort === e.link.toPort);
			if (idx < 0) return;
			const data = this.model.linkDataArray[idx];
			this.model.linkDataArray.splice(idx, 1);
			this.fireChange(ChangedEvent.Remove, 'linkDataArray', data, null, true);
		});
		ss.on('nodeMoved', (e) => {
			const data = this.model.nodeDataArray.find((d) => d.id === e.node.id);
			if (data === undefined) return;
			data.loc = `${e.node.x} ${e.node.y}`;
			const wrapper = this.liveNodes.get(e.node.id);
			if (wrapper !== undefined) wrapper.location = new Point(e.node.x, e.node.y);
			// "SelectionMoved" listeners want a subject iterator over
			// the moved parts. We synthesise a single-part subject.
			const subject = { each: (cb: (part: unknown) => void) => { cb(this.getOrCreateLiveNode(e.node.id, data)); } };
			const listeners = this.diagramListeners.get('SelectionMoved') ?? [];
			for (const l of listeners) try { l({ subject }); } catch (err) { console.error(err); }
		});
		ss.on('nodeSelected', (e) => {
			if (e.node === null) return;
			const data = this.model.nodeDataArray.find((d) => d.id === e.node!.id);
			if (data === undefined) return;
			const live = this.getOrCreateLiveNode(e.node.id, data);
			live.isSelected = e.selected;
			// The node template's `selectionChanged` callback fires here.
			const tmpl = diagram._nodeTemplate as unknown as { selectionChanged?: (part: unknown) => void };
			tmpl?.selectionChanged?.(live);
		});
		ss.on('nodeOpen', (e) => {
			const data = this.model.nodeDataArray.find((d) => d.id === e.node.id);
			if (data === undefined || typeof data.openAction !== 'string' || data.openAction.length === 0) return;
			const live = this.getOrCreateLiveNode(e.node.id, data);
			const tmpl = diagram._nodeTemplate as unknown as { doubleClick?: (event: unknown, node: unknown) => void };
			tmpl?.doubleClick?.({}, live);
		});
		ss.on('linkSelected', (e) => {
			if (e.link === null) return;
			const live = this.getOrCreateLiveLink(e.link);
			live.isSelected = e.selected;
			const tmpl = diagram._linkTemplate as unknown as { selectionChanged?: (part: unknown) => void };
			tmpl?.selectionChanged?.(live);
		});
	}

	attachModel(model: GraphLinksModel, sync: boolean = true): void {
		if (this.model._bridge === this)
			this.model._bridge = null;
		this.model = model;
		model._bridge = this;
		this.liveNodes.clear();
		this.liveLinks.clear();
		if (!sync)
			return;
		this.syncingFromSs = true;
		try {
			this.ss.load(
				model.nodeDataArray.map((data) => this.nodeDataToInit(data)),
				model.linkDataArray.map((data) => ({
					from: data.from,
					fromPort: data.fromPort,
					to: data.to,
					toPort: data.toPort,
				})),
			);
		} finally {
			this.syncingFromSs = false;
		}
	}

	fireChange(change: unknown, modelChange: string, oldValue: unknown, newValue: unknown, isTransactionFinished: boolean): void {
		const evt = new ChangedEvent(change, modelChange, oldValue, newValue, isTransactionFinished);
		for (const l of this.modelListeners) try { l(evt); } catch (e) { console.error(e); }
	}
	addModelChangedListener(cb: (evt: ChangedEvent) => void): void { this.modelListeners.push(cb); }
	addDiagramListener(name: string, cb: (evt: { subject: { each: (cb: (part: unknown) => void) => void } }) => void): void {
		let arr = this.diagramListeners.get(name);
		if (arr === undefined) { arr = []; this.diagramListeners.set(name, arr); }
		arr.push(cb);
	}

	getOrCreateLiveNode(key: string, data: NodeDataAny): LiveNode {
		let live = this.liveNodes.get(key);
		if (live === undefined) {
			live = new LiveNode(this, data, key);
			this.liveNodes.set(key, live);
		}
		live.data = data;
		const loc = typeof data.loc === 'string' ? Point.parse(data.loc) : new Point(0, 0);
		live.location = loc;
		return live;
	}
	getOrCreateLiveLink(model: LinkModel): LiveLink {
		const key = `${model.from}|${model.fromPort}|${model.to}|${model.toPort}`;
		let live = this.liveLinks.get(key);
		if (live === undefined) {
			const data = this.model.linkDataArray.find((d) => d.from === model.from && d.fromPort === model.fromPort && d.to === model.to && d.toPort === model.toPort);
			live = new LiveLink(this, data ?? { from: model.from, fromPort: model.fromPort, to: model.to, toPort: model.toPort });
			this.liveLinks.set(key, live);
		}
		return live;
	}

	// model.addNodeData → push to ssgraph too.
	onNodeInserted(data: NodeDataAny, fromSs: boolean): void {
		if (!fromSs) {
			const init = this.nodeDataToInit(data);
			this.syncingFromSs = true;
			try { this.ss.addDiagramNode(init); } finally { this.syncingFromSs = false; }
		}
		this.fireChange(ChangedEvent.Insert, 'nodeDataArray', null, data, true);
	}
	onNodeRemoved(data: NodeDataAny, fromSs: boolean): void {
		if (!fromSs) {
			this.syncingFromSs = true;
			try { this.ss.removeDiagramNode(data.id); } finally { this.syncingFromSs = false; }
		}
		this.liveNodes.delete(data.id);
		this.fireChange(ChangedEvent.Remove, 'nodeDataArray', data, null, true);
	}
	onLinkInserted(data: LinkDataAny, fromSs: boolean): void {
		if (!fromSs) {
			const init: LinkInit = { from: data.from, fromPort: data.fromPort, to: data.to, toPort: data.toPort };
			this.syncingFromSs = true;
			try { this.ss.addLink(init); } finally { this.syncingFromSs = false; }
		}
		this.fireChange(ChangedEvent.Insert, 'linkDataArray', null, data, true);
	}
	onLinkRemoved(data: LinkDataAny, fromSs: boolean): void {
		if (!fromSs) {
			this.syncingFromSs = true;
			try { this.ss.removeLink({ from: data.from, fromPort: data.fromPort, to: data.to, toPort: data.toPort }); }
			finally { this.syncingFromSs = false; }
		}
		this.fireChange(ChangedEvent.Remove, 'linkDataArray', data, null, true);
	}
	onDataPropertyChanged(data: Record<string, unknown>, name: string, _value: unknown): void {
		// If this is a node-data change, push relevant fields through
		// to ssgraph so colour/border/name updates show up live.
		const nodeData = this.model.nodeDataArray.find((d) => d === data);
		if (nodeData !== undefined) {
			// Re-derive the live ssgraph node and patch its fields.
			const ssNode = this.findSsNode(nodeData.id);
			if (ssNode !== undefined) {
				if (name === 'color' && typeof nodeData.color === 'string' && nodeData.color.length > 0) ssNode.color = nodeData.color;
				if (name === 'border' && typeof nodeData.border === 'string' && nodeData.border.length > 0) ssNode.border = nodeData.border;
				if (name === 'name' && typeof nodeData.name === 'string') ssNode.name = nodeData.name;
				if (name === 'openAction') ssNode.openAction = typeof nodeData.openAction === 'string' ? nodeData.openAction : '';
				if (name === 'loc' && typeof nodeData.loc === 'string') {
					const p = Point.parse(nodeData.loc);
					ssNode.x = p.x; ssNode.y = p.y;
				}
			}
		}
		this.fireChange('Property', name, null, _value, true);
	}
	onPortArrayMutated(arr: unknown[]): void {
		// inPorts / outPorts mutations on a node — find which node and
		// rebuild its ssgraph ports. The model-level array is the
		// source of truth; ssgraph just mirrors it.
		for (const nd of this.model.nodeDataArray) {
			if (nd.inPorts === arr || nd.outPorts === arr) {
				const ssNode = this.findSsNode(nd.id);
				if (ssNode === undefined) return;
				const toInit = (p: PortDataAny): PortInit => ({
					id: String(p.id),
					name: String(p.name ?? p.id),
					type: typeof p.type === 'string' ? p.type : '',
					maxLinks: typeof p.maxLinks === 'number' ? p.maxLinks : 0,
				});
				ssNode.inPorts = (nd.inPorts ?? []).map((p) => new PortModel(toInit(p), 'in'));
				ssNode.outPorts = (nd.outPorts ?? []).map((p) => new PortModel(toInit(p), 'out'));
				this.ss.requestRedraw();
				return;
			}
		}
	}

	private findSsNode(id: string): NodeModel | undefined { return this.ss.findNode(id); }

	private nodeDataToInit(data: NodeDataAny): DiagramNodeInit {
		const loc = typeof data.loc === 'string' ? Point.parse(data.loc) : new Point(0, 0);
		const toInit = (p: PortDataAny): PortInit => ({
			id: String(p.id),
			name: String(p.name ?? p.id),
			type: typeof p.type === 'string' ? p.type : '',
			maxLinks: typeof p.maxLinks === 'number' ? p.maxLinks : 0,
		});
		return {
			id: data.id,
			typeId: typeof data.typeId === 'string' ? data.typeId : data.id,
			name: typeof data.name === 'string' ? data.name : data.id,
			color: typeof data.color === 'string' && data.color.length > 0 ? data.color : undefined,
			border: typeof data.border === 'string' && data.border.length > 0 ? data.border : undefined,
			icon: typeof data.icon === 'string' ? data.icon : undefined,
			openAction: typeof data.openAction === 'string' ? data.openAction : undefined,
			x: loc.x,
			y: loc.y,
			inPorts: (data.inPorts ?? []).map(toInit),
			outPorts: (data.outPorts ?? []).map(toInit),
		};
	}

	private nodeModelToData(n: NodeModel): NodeDataAny {
		return {
			id: n.id,
			typeId: n.typeId,
			name: n.name,
			color: n.color,
			border: n.border,
			icon: n.icon,
			openAction: n.openAction,
			loc: `${n.x} ${n.y}`,
			inPorts: n.inPorts.map((p) => ({ id: p.id, name: p.name, type: p.type, maxLinks: p.maxLinks, direction: 'in' })),
			outPorts: n.outPorts.map((p) => ({ id: p.id, name: p.name, type: p.type, maxLinks: p.maxLinks, direction: 'out' })),
		};
	}
}

// ---------------------------------------------------------------------
// CommandHandler / ToolManager — thin facades over ssgraph's API.
// ---------------------------------------------------------------------

class CommandHandler {
	private readonly bridge: ModelBridge;
	constructor(bridge: ModelBridge) { this.bridge = bridge; }
	canUndo(): boolean { return this.bridge.ss.canUndo(); }
	canRedo(): boolean { return this.bridge.ss.canRedo(); }
	canCutSelection(): boolean { return this.bridge.ss.selectedNodeId() !== null; }
	canCopySelection(): boolean { return this.bridge.ss.selectedNodeId() !== null; }
	canPasteSelection(): boolean { return true; }
	canDeleteSelection(): boolean { return this.bridge.ss.selectedNodeId() !== null; }
	undo(): void { this.bridge.ss.undo(); }
	redo(): void { this.bridge.ss.redo(); }
	cutSelection(): void { this.bridge.ss.cutSelection(); }
	copySelection(): void { this.bridge.ss.copySelection(); }
	pasteSelection(_point?: Point): void { this.bridge.ss.pasteSelection(); }
	deleteSelection(): void { this.bridge.ss.deleteSelection(); }
	zoomToFit(): void { this.bridge.ss.zoomToFit(); }
}

interface LinkingTool {
	portGravity: number;
	isUnconnectedLinkValid: boolean;
	linkValidation: ((fromNode: Node, fromPort: GraphObject, toNode: Node, toPort: GraphObject) => boolean) | null;
}

class ToolManager {
	linkingTool: LinkingTool = { portGravity: 0, isUnconnectedLinkValid: false, linkValidation: null };
	relinkingTool: LinkingTool = { portGravity: 0, isUnconnectedLinkValid: false, linkValidation: null };
	hoverDelay: number = 0;
	// `contextMenuTool.showContextMenu` is monkey-patched by diagram.ts;
	// we provide an inert default so the assignment doesn't crash.
	contextMenuTool: { showContextMenu: (cm: unknown, obj: unknown) => void } = {
		showContextMenu: (_cm: unknown, _obj: unknown) => { /* intentionally inert */ },
	};
}

// ---------------------------------------------------------------------
// Diagram wrapper — what `new go.Diagram(div, opts)` actually returns.
// Holds a real ssgraph instance and exposes the legacy declarative
// shape diagram.ts expects.
// ---------------------------------------------------------------------

class Diagram {
	readonly div: HTMLElement;
	readonly ss: SsDiagram;
	readonly _bridge: ModelBridge;
	private _model: GraphLinksModel;
	get model(): GraphLinksModel { return this._model; }
	set model(value: GraphLinksModel) {
		this._model = value;
		if (this._bridge !== undefined)
			this._bridge.attachModel(value);
	}
	commandHandler: CommandHandler;
	toolManager: ToolManager;
	scale: number = 1;
	// Propagate read-only to the underlying ssgraph engine (it owns the editing
	// gestures; the wrapper flag alone does nothing). Used by diagram.ts.setReadOnly.
	private _isReadOnly = false;
	get isReadOnly(): boolean { return this._isReadOnly; }
	set isReadOnly(value: boolean) { this._isReadOnly = value; this.ss.setReadOnly(value); }
	allowDrop: boolean = true;
	allowCopy: boolean = true;
	allowDelete: boolean = true;
	allowLink: boolean = true;
	allowMove: boolean = true;
	_nodeTemplate: unknown = null;
	_linkTemplate: unknown = null;
	contextMenu: unknown = null;
	lastInput: { documentPoint: Point } = { documentPoint: new Point(0, 0) };
	selection: { each: (cb: (part: Part) => void) => void; count: number } = { each: () => { /* populated post-init */ }, count: 0 };
	nodes: { each: (cb: (node: Node) => void) => void } = { each: () => { /* populated post-init */ } };
	links: { each: (cb: (link: Link) => void) => void } = { each: () => { /* populated post-init */ } };

	// undoManager mock — diagram.ts checks `.isInTransaction` to
	// decide whether to roll back before swapping models.
	undoManager: { isInTransaction: boolean } = { isInTransaction: false };

	constructor(host: HTMLElement, _opts: Record<string, unknown>) {
		this.div = host;
		this.ss = new SsDiagram({ host });
		this._model = new GraphLinksModel();
		this._bridge = new ModelBridge(this, this.ss, this._model);
		this.commandHandler = new CommandHandler(this._bridge);
		this.toolManager = new ToolManager();

		// Live iterators that walk the current model state every time
		// they're called — diagram.ts loops over them at runtime.
		const owner = this;
		this.selection = {
			each: (cb: (part: Part) => void): void => {
				const id = this.ss.selectedNodeId();
				if (id === null) return;
				const data = this.model.nodeDataArray.find((d) => d.id === id);
				if (data === undefined) return;
				cb(this._bridge.getOrCreateLiveNode(id, data));
			},
			get count(): number { return owner.ss.selectedNodeId() === null ? 0 : 1; },
		} as unknown as { each: (cb: (part: Part) => void) => void; count: number };

		this.nodes = {
			each: (cb: (node: Node) => void): void => {
				for (const data of this.model.nodeDataArray) {
					cb(this._bridge.getOrCreateLiveNode(data.id, data));
				}
			},
		};
		this.links = {
			each: (cb: (link: Link) => void): void => {
				for (const data of this.model.linkDataArray) {
					const lm = new LinkModel(data.from, data.fromPort, data.to, data.toPort);
					cb(this._bridge.getOrCreateLiveLink(lm));
				}
			},
		};
		// Single ssgraph-level validator that consults BOTH linkingTool
		// and relinkingTool validation callbacks installed by diagram.ts.
		this.ss.setLinkValidator((args: LinkValidatorArgs): boolean => {
			const tm = this.toolManager;
			const fromLive = this._bridge.getOrCreateLiveNode(args.fromNode.id, this.model.nodeDataArray.find((d) => d.id === args.fromNode.id) as NodeDataAny);
			const toLive = this._bridge.getOrCreateLiveNode(args.toNode.id, this.model.nodeDataArray.find((d) => d.id === args.toNode.id) as NodeDataAny);
			// Synthesise port GraphObjects carrying `.data` so the
			// host validator can `(fromPort.data ?? fromPort.panel?.data)`.
			const fromPortObj = new GraphObject();
			(fromPortObj as unknown as { data: unknown }).data = this.findPortData(args.fromNode.id, args.fromPort.id, 'out');
			const toPortObj = new GraphObject();
			(toPortObj as unknown as { data: unknown }).data = this.findPortData(args.toNode.id, args.toPort.id, 'in');
			const v1 = tm.linkingTool.linkValidation;
			const v2 = tm.relinkingTool.linkValidation;
			if (v1 !== null && !v1(fromLive, fromPortObj, toLive, toPortObj)) return false;
			if (v2 !== null && !v2(fromLive, fromPortObj, toLive, toPortObj)) return false;
			return true;
		});

		// ssgraph `zoomChanged` → update our `scale` mirror + fire
		// ViewportBoundsChanged listeners.
		this.ss.on('zoomChanged', (e) => {
			this.scale = e.scale;
			const listeners = (this._bridge as unknown as { diagramListeners: Map<string, Array<(evt: unknown) => void>> }).diagramListeners.get('ViewportBoundsChanged') ?? [];
			for (const l of listeners) try { l({ subject: { each: () => { /* nothing relevant */ } } }); } catch (err) { console.error(err); }
		});
	}

	private findPortData(nodeId: string, portId: string, dir: 'in' | 'out'): PortDataAny | undefined {
		const nd = this.model.nodeDataArray.find((d) => d.id === nodeId);
		if (nd === undefined) return undefined;
		const list = dir === 'in' ? (nd.inPorts ?? []) : (nd.outPorts ?? []);
		return list.find((p) => p.id === portId);
	}

	// Templates — set, never executed.
	set nodeTemplate(t: unknown) { this._nodeTemplate = t; }
	get nodeTemplate(): unknown { return this._nodeTemplate; }
	set linkTemplate(t: unknown) { this._linkTemplate = t; }
	get linkTemplate(): unknown { return this._linkTemplate; }

	startTransaction(_name?: string): void { this.undoManager.isInTransaction = true; }
	commitTransaction(_name?: string): void { this.undoManager.isInTransaction = false; }
	rollbackTransaction(): void { this.undoManager.isInTransaction = false; }

	findNodeForKey(key: unknown): Node | null {
		const k = String(key);
		const data = this.model.nodeDataArray.find((d) => d.id === k);
		if (data === undefined) return null;
		return this._bridge.getOrCreateLiveNode(k, data);
	}
	addDiagramListener(name: string, cb: (evt: { subject: { each: (cb: (part: unknown) => void) => void } }) => void): void {
		this._bridge.addDiagramListener(name, cb);
	}
	addModelChangedListener(cb: (evt: ChangedEvent) => void): void { this._bridge.addModelChangedListener(cb); }
	updateAllTargetBindings(): void { this.ss.requestRedraw(); }
	remove(part: Part): void {
		if (part instanceof LiveNode) {
			this.model.removeNodeData(this.model.nodeDataArray.find((d) => d.id === part.key) as NodeDataAny);
		}
	}
	transformViewToDoc(p: Point): Point {
		const w = this.ss.viewToWorld(p.x, p.y);
		return new Point(w[0], w[1]);
	}
	select(part: Part): void {
		if (part instanceof LiveNode) this.ss.selectNodeById(part.key);
	}
	clearSelection(): void { this.ss.selectNodeById(null); }
}

class Palette extends Diagram {}

// Overview — ssgraph already paints its own minimap on the main canvas.
// We accept the host div + options bag for shape parity, then no-op.
class Overview {
	observed: Diagram | null;
	box: { findObject(name: string): Shape | null };
	constructor(_host: HTMLElement, opts: Record<string, unknown>) {
		this.observed = (opts.observed as Diagram) ?? null;
		this.box = { findObject: (_n: string): Shape | null => null };
	}
}

// ---------------------------------------------------------------------
// `go` namespace assembly + global publication.
// ---------------------------------------------------------------------

const go = {
	Point,
	Size,
	Margin,
	Spot,
	Binding,
	GraphObject: Object.assign(GraphObject, { make: gMake }),
	Panel,
	Placeholder,
	TextBlock,
	Picture,
	Shape,
	Group,
	GridLayout,
	Part,
	Node,
	Link,
	Adornment,
	ChangedEvent,
	GraphLinksModel,
	Diagram,
	Palette,
	Overview,
};

// Publish on window so separately built compatibility wrappers that reference
// the ambient `go` global can find the runtime.
// TODO: `window.go` is kept as the compat-shape name diagram.ts already
// reaches for — not a deliberate branding choice. Rename once diagram.ts
// is rewritten against the Layer-A `StockSharpDiagram` surface.
if (typeof window !== 'undefined')
	(window as unknown as { go: unknown }).go = go;

export default go;
