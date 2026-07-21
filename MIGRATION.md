# Consumer migration

Use this repository as the source of truth instead of copying diagram source
files into each application. Consumers can compile the TypeScript directly or
use the generated JavaScript and declaration files from `dist`.

## Choose an entry point

| Use case | Package entry point |
| --- | --- |
| Complete editable component | `ssdiagram` or `ssdiagram/source` |
| Low-level canvas renderer | `ssdiagram/ssgraph` or `ssdiagram/source/ssgraph` |
| Read-only web embed | `ssdiagram/embed` or `ssdiagram/source/embed` |
| Compatibility runtime | `ssdiagram/legacy` or `ssdiagram/source/legacy` |
| Catalog, palette and model types | `ssdiagram/catalog`, `ssdiagram/palette`, `ssdiagram/types` |

Use a `/source` entry when the consuming build compiles TypeScript. Use the
entry without `/source` when consuming the output of `npm run build`.

## Local source dependency

Add the repository as a file dependency:

```json
{
  "dependencies": {
    "ssdiagram": "file:../Diagram"
  }
}
```

Then import the complete component from its public source entry:

```ts
import {
  DiagramNode,
  Link,
  StockSharpCatalog,
  StockSharpDiagram,
  StockSharpPalette,
} from 'ssdiagram/source';
```

For read-only rendering:

```ts
import {
  renderAll,
  renderFromInline,
  renderFromSource,
  renderScheme,
} from 'ssdiagram/source/embed';
```

The consuming bundler follows these imports and compiles the required runtime
into its application bundle.

## Browser bundles

Applications that do not compile TypeScript can load a browser bundle from
`dist`:

- `dist/ssdiagram.js` — complete component exposed as `window.SSDiagram`;
- `dist/ssgraph.js` — low-level renderer exposed as `window.SSGraph`;
- `dist/ssdiagram-legacy.js` — compatibility-only runtime.

## Migration checklist

1. Add the package or local file dependency.
2. Replace copied source files with imports from one of the public entry points.
3. Run the consuming application's type check, tests and production build.
4. Verify editing, persistence, read-only rendering, resize handling and themes.
5. Remove old source copies and redundant bundle steps only after every consumer
   has moved to the shared package.
