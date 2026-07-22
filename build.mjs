import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
const demoDist = join(here, 'demo', 'dist');

// The targets are fixed children of this repository, never caller-provided paths.
await Promise.all([
    rm(dist, { recursive: true, force: true }),
    rm(demoDist, { recursive: true, force: true }),
]);

await execFileAsync(
    process.execPath,
    [join(here, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(here, 'tsconfig.build.json')],
    { cwd: here },
);

const targets = [
    {
        // Complete public stack: StockSharpDiagram + catalog/types/palette/embed.
        entryPoints: [join(here, 'src', 'index.ts')],
        outfile: join(dist, 'ssdiagram.js'),
        globalName: 'SSDiagram',
    },
    {
        entryPoints: [join(here, 'examples', 'basic.ts')],
        outfile: join(demoDist, 'demo.js'),
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
