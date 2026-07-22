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
```

The local demo is served at http://localhost:8792/demo/index.html.

CI verifies type checking, unit/integration tests, all bundles and tarball
contents. GitHub Pages publishes the demo from `main`; GitHub Releases receive
the built tarball. Public npm publication is intentionally disabled with
`private: true` under the proprietary StockSharp license.

## License

Copyright © 2010-present StockSharp Platform LLC and/or its affiliates. All
rights reserved. Use is governed by the StockSharp EULA and [LICENSE](LICENSE).
