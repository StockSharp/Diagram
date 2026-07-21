# StockSharp JS Strategy Diagram

The complete StockSharp web strategy-diagram component: the typed
`StockSharpDiagram` API, catalog and palette, the canvas renderer, the
Docs/Portal embed layer, and the temporary `window.go` compatibility runtime.

![StockSharp JS Strategy Diagram — visual strategy editor with typed connections and element palette](sample.png)

**Live demo: https://stocksharp.github.io/Diagram/demo/**

The demo uses the same full stack exported to applications. It is not a
separate mock renderer.

## What is actually current?

The original implementation is layered, not duplicated:

| Layer | Source | Purpose |
| --- | --- | --- |
| Public component API | `src/diagram/diagram.ts` | `StockSharpDiagram`: catalog-aware nodes, ports, validation, events, persistence, history and theming |
| Models and palette | `src/diagram/{types,catalog,palette}.ts` | Public data model and draggable HTML element palette |
| Web embed | `src/embed.ts` | Read-only rendering used by Docs and Portal |
| Compatibility runtime | `src/ssdiagram.ts` | Implements the legacy diagram namespace on top of the canvas renderer |
| Canvas renderer | `src/ssgraph.ts` | Drawing, routing, selection, editing, zoom, touch and overview |

`ssgraph` is the current renderer, but it is not the whole component.
`StockSharpDiagram` is the public application API. `embed.ts` is the newest
site-facing layer and is part of the component because Docs and Portal consume
it directly.

The standalone version also repairs the model boundary between
`StockSharpDiagram` and the compatibility runtime: replacing a
`GraphLinksModel` now reattaches the bridge and reloads the canvas renderer.
The embed layer therefore uses public methods instead of reaching through
private `_bridge` and `ss` properties.

## Commit provenance

The source selection was checked against the StockSharpApps and Web histories:

- `5fda0a143` — May 20: merged the typed Designer diagram API, catalog,
  palette and types;
- `a9f1e794e` — May 23: introduced `ssdiagram` over `ssgraph` and connected
  the Designer to the in-house runtime;
- `d79dcd793` — June 20: changed both runtime layers together for read-only
  mode and node icons;
- `0bbdfe5b7` — July 12: added the shared Docs/Portal `embed.ts` layer and
  the matching link-lightness changes in `ssgraph`;
- Web commit `0d35fc838` — July 12: wired that shared embed into both Docs
  and Portal.

This is why extracting only `ssgraph.ts` and `ssdiagram.ts` would lose the
latest site integration and the real public API.

## Repository layout

```text
src/
  index.ts                 complete public entry point
  diagram/
    diagram.ts             StockSharpDiagram API
    types.ts               Node, DiagramNode, Port and Link models
    catalog.ts             node and socket-type catalog
    palette.ts             draggable HTML palette
    event-emitter.ts
    ssdiagram.d.ts         legacy compatibility type surface
  embed.ts                 Docs/Portal read-only renderer
  ssdiagram.ts             compatibility runtime
  ssgraph.ts               canvas renderer
examples/basic.ts          full-stack demo source
demo/                      Charts-style GitHub Pages shell
tests/                     renderer, bridge and public-API integration tests
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

- `ssdiagram/ssgraph` — low-level canvas renderer used by Backoffice;
- `ssdiagram/embed` — compiled Docs/Portal renderer;
- `ssdiagram/legacy` — compatibility runtime only;
- `ssdiagram/catalog`, `ssdiagram/palette`, `ssdiagram/types`.

## Build output

`npm run build` produces:

| File | Purpose |
| --- | --- |
| `dist/esm/**` | complete ESM module tree |
| `dist/types/**` | TypeScript declarations |
| `dist/ssdiagram.js` | complete browser IIFE exposed as `window.SSDiagram`; also installs `window.go` |
| `dist/ssdiagram-legacy.js` | compatibility-only IIFE |
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

See [MIGRATION.md](MIGRATION.md) for the consumer migration map.

## License

Copyright © 2010-present StockSharp Platform LLC and/or its affiliates. All
rights reserved. Use is governed by the StockSharp EULA and [LICENSE](LICENSE).
