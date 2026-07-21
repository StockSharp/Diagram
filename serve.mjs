import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const host = process.env.DIAGRAM_HOST || '0.0.0.0';
const port = Number(process.env.DIAGRAM_PORT) || 8792;
const mime = {
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.map': 'application/json',
    '.svg': 'image/svg+xml',
};

createServer(async (request, response) => {
    try {
        const url = decodeURIComponent((request.url || '/').split('?')[0]);
        const relative = normalize(url).replace(/^([.][.][/\\])+/, '');
        const file = join(root, relative === '/' ? 'demo/index.html' : relative);
        const body = await readFile(file);
        response.writeHead(200, {
            'content-type': mime[extname(file)] ?? 'application/octet-stream',
            'cache-control': 'no-store',
        });
        response.end(body);
    } catch {
        response.writeHead(404);
        response.end('not found');
    }
}).listen(port, host, () => {
    console.log(`serving Diagram on http://${host}:${port}/demo/index.html`);
});
