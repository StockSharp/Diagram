# StockSharp JS Strategy Diagram

The complete StockSharp web strategy-diagram component: the typed
`StockSharpDiagram` API, catalog and palette, the canvas renderer, the
read-only web embed, and an optional legacy compatibility entry point.

![StockSharp JS Strategy Diagram — visual strategy editor with typed connections and element palette](sample.png)

**Live demo: https://stocksharp.github.io/Diagram/demo/**

The demo uses the same full stack exported to applications. It is not a
separate mock renderer.

## Architecture

The component has one document model and a separate rendering layer:

| Layer | Source | Purpose |
| --- | --- | --- |
| Document core | `src/core/*` | Versioned document serialization plus independent runtime, view and selection state |
| Public component API | `src/diagram/stocksharp-diagram.ts` | `StockSharpDiagram`: catalog-aware nodes, ports, validation, events, persistence, history and theming |
| Models and palette | `src/diagram/{types,catalog,palette}.ts` | Public data model and draggable HTML element palette |
| Web embed | `src/embed.ts` | Self-contained read-only rendering for web applications |
| Compatibility runtime | `src/ssdiagram.ts` | Implements the legacy diagram namespace on top of the canvas renderer |
| Canvas renderer | `src/ssgraph.ts` | Drawing, routing, selection, editing, zoom, touch and overview |

`StockSharpDiagram` talks directly to `ssgraph`; the public path does not load
or install `window.go`. The compatibility runtime is isolated behind the
`ssdiagram/legacy` entry point.

The layers ship together so applications can use the high-level component,
the read-only embed, or the low-level renderer without maintaining copied
source files.

## Repository layout

```text
src/
  index.ts                 complete public entry point
  core/
    model.ts               canonical versioned document
    document.ts            validation and serialization
    state.ts               runtime, view and selection state
    history.ts             commands, transactions, undo and redo
    action-registry.ts     executable context and host actions
  diagram/
    stocksharp-diagram.ts  StockSharpDiagram API
    api.ts                 typed public events and options
    types.ts               Node, DiagramNode, Port and Link models
    catalog.ts             node and socket-type catalog
    palette.ts             draggable HTML palette
    event-emitter.ts
  embed.ts                 self-contained read-only web renderer
  ssdiagram.ts             compatibility runtime
  ssgraph.ts               canvas renderer
examples/basic.ts          full-stack demo source
demo/                      Charts-style GitHub Pages shell
tests/                     core, renderer and public-API integration tests
```

## TypeScript usage

```ts
import {
  DiagramNode,
  Link,
  Node,
  StockSharpCatalog,
  StockSharpDiagram,
} from 'ssdiagram';

const catalog = new StockSharpCatalog();
catalog.addNodeType(new Node({
  id: 'source',
  name: 'Market Data',
  outPorts: [{ id: 'candles', name: 'Candles', type: 'Candle' }],
}));

const host = document.querySelector<HTMLElement>('#diagram')!;
const diagram = new StockSharpDiagram({ div: host, catalog });

diagram.load([
  new DiagramNode({
    id: 'market',
    typeId: 'source',
    name: 'BTC/USDT',
    outPorts: [{ id: 'candles', name: 'Candles', type: 'Candle' }],
    x: 20,
    y: 80,
  }),
], []);

diagram.setTheme({
  diagramBackground: '#131820',
  gridColor: '#1e2633',
});
```

See `examples/basic.ts` for catalog construction, the draggable palette,
typed links, history, read-only mode, resize handling and theme switching.

The palette mirrors the Designer toolbox contract without owning host
behaviour. Subscribe to `nodeActivated` to insert/open an element and to
`contextMenuRequested` to show host-specific help. `setExcludedTypeIds()` and
`setNodeTypeExcluded()` hide elements dynamically; selection, filtering,
category expansion and catalog refreshes remain stable. Call `destroy()` when
the palette host is disposed so its catalog subscription is released.

Read-only mode remains inspectable: nodes, links and ports can still be
selected, copied and opened through host actions, while move/link/delete,
paste and history commands are disabled. Applications that need a different
policy can use `setInteractionPermissions()`.

`copySelectionToClipboard()` and `pasteSelectionFromClipboard()` use the
browser text clipboard when available and fall back to the last in-memory
copy. The versioned payload preserves node, port and link metadata and pastes
the complete selection as one undo transaction.

Node dragging snaps to the visible grid by default in `StockSharpDiagram`.
Configure it at construction time with `gridSnap` / `gridSize`, or at runtime
with `setGridSnap(enabled, size)`. Arrow keys move the current node selection
by one grid cell (Shift moves five); the whole gesture is one undo step.

Variadic input sockets use `isDynamic: true` with `dynamicMode: 'onConnect'`.
Connecting to that anchor creates a single-link sibling typed from the source;
disconnecting, relinking, or deleting the source prunes an orphan sibling. The
port and wire lifecycle is one undoable transaction and round-trips unchanged.

Viewport preferences are deliberately separate from the strategy document.
Persist `diagram.saveViewState()` in host settings and restore it with
`diagram.loadViewState(value)`. The versioned snapshot contains zoom, pan and
overview visibility; `viewChanged` fires for programmatic and interactive
viewport changes. A damaged settings value throws `DiagramViewStateError`
without modifying the current viewport.

`takeScreenshot()` returns a detached canvas exactly like the Charts API and
the WPF `SaveToImage` flow. With no options it copies the current viewport;
`takeScreenshot({ scope: 'content', pixelRatio: 2 })` renders the complete
scheme without moving or resizing the visible editor. Export options control
padding, background, grid, overview, selection and transient runtime state;
encode the returned canvas with `toBlob()` or `toDataURL()`.

The Docs/Portal helpers return a `DiagramEmbedHandle`. Re-rendering the same
host disposes its previous canvas, observers and timers; removing the host from
the DOM also disposes it automatically. Custom integrations can call
`handle.destroy()` or `destroyRenderedDiagram(host)` explicitly.
If a saved scheme references an element absent from the current palette, its
node is rendered as a transient red placeholder whose hover tooltip names the
missing type. Sites can localize that message through
`data-diagram-missing-element="Missing: {typeId}"` on the host.

### Node actions and errors

Double-click handling is opt-in. Give only the node types controlled by the
host a non-empty `openAction`, then dispatch that value from `nodeOpen`:

```ts
catalog.addNodeType(new Node({
  id: 'indicator',
  name: 'Indicator',
  openAction: 'indicatorSettings',
}));

diagram.on('nodeOpen', ({ nodes }) => {
  const node = nodes[0];
  if (node?.openAction === 'indicatorSettings') openIndicatorDialog(node);
});
```

Socket input is reported separately through `portClicked`, with
`leftClick`/`rightClick`, direction, and keyboard modifiers. A right-click
never starts a wire. `contextMenuRequested` also includes the exact port when
the menu was opened over a socket.

Runtime failures flash the node border before leaving it red. Errors found
while loading a scheme use a red background. Hovering either state shows the
full error text in a tooltip:

```ts
diagram.setNodeError('orders', 'Order volume is not configured.');

diagram.load(nodes, links, {
  nodeErrors: {
    indicator_2: 'The saved Period value is invalid.',
  },
});

diagram.clearNodeError('orders');
```

Use `{ kind: 'load' }` with `setNodeError` to add a load-style error after the
initial load. Errors applied through this API are transient and are not written
by `save()`.

### Debugger state

Execution state is deliberately separate from the saved scheme and undo
history. The host can mark the active element, publish socket values and
breakpoints, or cover an unusable scheme with a global status:

```ts
diagram.setActiveNode('indicator_2');
diagram.setPortRuntimeState('indicator_2', 'out', 'value', {
  breakpoint: true,
  breakpointActive: true,
  value: '102.45',
});
diagram.setGlobalError('This strategy is encrypted.', 'encrypted');
```

Use `setRuntimeState()` for an atomic debugger snapshot and
`clearRuntimeState()` when execution stops. `runtimeStateChanged` always
returns a detached snapshot safe for host-side state stores.

If `loadDocument()` receives malformed JSON or an unsupported document, the
currently displayed scheme is left intact, a global `load` overlay shows the
failure, and `documentLoadFailed` is emitted. The original exception is still
thrown so callers can log or report it; loading a valid document clears the
overlay.

## Source-first consumption

Applications can let their own esbuild/Vite build compile this repository's
TypeScript:

```json
{
  "dependencies": {
    "ssdiagram": "file:../../Diagram"
  }
}
```

```ts
import { StockSharpDiagram } from 'ssdiagram/source';
import { renderAll } from 'ssdiagram/source/embed';
```

Dedicated entry points are available for consumers with narrower needs:

- `ssdiagram/document` - versioned document parser and serializer;
- `ssdiagram/state` - runtime/view/selection state helpers;
- `ssdiagram/history` - command and transaction history;
- `ssdiagram/actions` - typed action registry;
- `ssdiagram/ssgraph` — low-level canvas renderer;
- `ssdiagram/embed` — compiled read-only web renderer;
- `ssdiagram/legacy` — compatibility runtime only;
- `ssdiagram/catalog`, `ssdiagram/palette`, `ssdiagram/types`.

## Build output

`npm run build` produces:

| File | Purpose |
| --- | --- |
| `dist/esm/**` | complete ESM module tree |
| `dist/types/**` | TypeScript declarations |
| `dist/ssdiagram.js` | complete browser IIFE exposed as `window.SSDiagram` |
| `dist/ssdiagram-legacy.js` | compatibility-only IIFE that installs `window.go` |
| `dist/ssgraph.js` | low-level renderer IIFE exposed as `window.SSGraph` |
| `dist/demo.js` | full-stack interactive example |

## Commands

```text
npm ci
npm test
npm run build
npm run serve
npm run pack:check
npm run api:check
npm run api:update  # only after reviewing an intentional public API change
npm run test:browser
npm run test:browser:update  # only after reviewing visual changes
```

The local demo is served at http://localhost:8792/demo/index.html.

The browser suite covers Chromium smoke/lifecycle scenarios at DPR 1 and 2,
plus reviewed dark/light overview goldens.

CI verifies type checking, the reviewed declaration snapshot, unit/integration
tests, Chromium smoke/lifecycle checks, dark/light overview goldens, all
bundles and tarball contents. GitHub Pages publishes the demo from `main`;
GitHub Releases receive the built tarball. Public npm publication is
intentionally disabled with `private: true` under the proprietary StockSharp
license.

## License

Copyright © 2010-present StockSharp Platform LLC and/or its affiliates. All
rights reserved. Use is governed by the StockSharp EULA and [LICENSE](LICENSE).
