import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');

// The target is a fixed child of this repository, never a caller-provided path.
await rm(dist, { recursive: true, force: true });

await execFileAsync(
    process.execPath,
    [join(here, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(here, 'tsconfig.build.json')],
    { cwd: here },
);

const targets = [
    {
        entryPoints: [join(here, 'src', 'ssgraph.ts')],
        outfile: join(dist, 'ssgraph.js'),
        globalName: 'SSGraph',
    },
    {
        // Complete public stack: StockSharpDiagram + catalog/types/palette/embed.
        // The go-compatible runtime is intentionally a separate legacy bundle.
        entryPoints: [join(here, 'src', 'index.ts')],
        outfile: join(dist, 'ssdiagram.js'),
        globalName: 'SSDiagram',
    },
    {
        // Compatibility-only bundle for hosts that still load window.go before
        // a separately compiled legacy wrapper.
        entryPoints: [join(here, 'src', 'ssdiagram.ts')],
        outfile: join(dist, 'ssdiagram-legacy.js'),
        globalName: 'SSDiagramLegacy',
    },
    {
        entryPoints: [join(here, 'examples', 'basic.ts')],
        outfile: join(dist, 'demo.js'),
    },
];

for (const target of targets) {
    await build({
        ...target,
        bundle: true,
        format: 'iife',
        sourcemap: true,
        target: 'es2020',
        logLevel: 'info',
    });
}
