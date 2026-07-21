# Consumer migration

`Diagram/src` is intended to replace all duplicated diagram TypeScript in
Broker.WebShared and Broker.Web.Designer.

## Source-of-truth map

| Consumer | Entry point |
| --- | --- |
| Broker Backoffice schema preview | `Diagram/src/ssgraph.ts` |
| Broker Designer | `Diagram/src/index.ts` plus the public `diagram/*` modules |
| Docs read-only diagrams | `Diagram/src/embed.ts` |
| Portal `@diagram` rendering | `Diagram/src/embed.ts` |

Recommended checkout layout:

```text
stocksharp/
  Diagram/
  stocksharpapps/
  web/
```

## Broker Backoffice

The Backoffice bundle can continue to use the lower-level renderer because its
schema card needs only read-only canvas rendering:

```ts
import { Diagram } from '../../../../../Diagram/src/ssgraph';
import type {
  DiagramNodeInit,
  LinkInit,
} from '../../../../../Diagram/src/ssgraph';
```

Its existing esbuild step follows and compiles the TypeScript source.

## Broker Designer

The Designer should resolve its diagram imports to this repository instead of
keeping local copies of `diagram.ts`, `types.ts`, `catalog.ts`,
`palette.ts` and `event-emitter.ts`.

With a local package dependency:

```json
{
  "dependencies": {
    "ssdiagram": "file:../../../Diagram"
  }
}
```

Application modules can then import:

```ts
import {
  StockSharpDiagram,
  StockSharpCatalog,
  StockSharpPalette,
  DiagramNode,
  Link,
} from 'ssdiagram/source';
```

Bundling that source entry includes the compatibility runtime automatically, so
the Designer no longer needs a separately copied Broker.WebShared
`ssdiagram.js`.

## Docs and Portal

The thin site entries should import the shared embed directly from Diagram:

```ts
import {
  renderAll,
  renderFromInline,
  renderFromSource,
  renderScheme,
} from '../../../../Diagram/src/embed';
```

Because `embed.ts` imports the complete component transitively, each site's
existing esbuild target produces a self-contained bundle. The separate
`BundleSsDiagram` MSBuild target and the requirement to load
`ssdiagram.js` first can then be removed.

## Rollout

1. Publish and check out `Diagram` beside `stocksharpapps` and `web`.
2. Move Docs and Portal imports from Designer's `embed.ts` to
   `Diagram/src/embed.ts`.
3. Move Backoffice to `Diagram/src/ssgraph.ts`.
4. Alias the Designer's diagram imports to `Diagram/src`.
5. Verify Designer editing, Backoffice read-only rendering, Docs and Portal.
6. Remove the duplicated Broker.WebShared `ssgraph` / `ssdiagram` folders
   and the copied Designer diagram modules only after every build is green.

During rollout, `dist/ssdiagram-legacy.js` remains available for pages that
still compile the old Designer wrapper separately.
