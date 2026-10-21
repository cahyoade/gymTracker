import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || (process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.txt':'text/plain', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const publicFile = relative => ['index.html','styles.css','sw.js','manifest.webmanifest','data/exercises.json','data/EXERCISES-LICENSE.txt'].includes(relative) || /^(js\/[^/]+\.js|icons\/[^/]+\.(svg|png))$/.test(relative);
export function createAppServer({ beforeRequest, transform, publicOnly = false } = {}) {
  return http.createServer(async (req, res) => {
    try {
      if (beforeRequest && await beforeRequest(req, res)) return;
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const target = path.resolve(root, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
      const relative = path.relative(root, target);
      if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(part => part.startsWith('.')) || relative.split(path.sep).includes('node_modules')) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      if (publicOnly && !publicFile(relative.split(path.sep).join('/'))) {
        res.writeHead(403); res.end('Forbidden'); return;
      }
      let content = await readFile(target);
      if (transform) content = await transform(target, content);
      res.writeHead(200, { 'Content-Type': `${mime[path.extname(target)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(content);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
}
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const server = createAppServer({publicOnly:!['127.0.0.1','localhost','::1'].includes(host)});
  server.listen(port, host, () => {
    console.log(`Form is ready at http://${host==='0.0.0.0' || host==='127.0.0.1' ? 'localhost' : host}:${port}`);
    if(host==='0.0.0.0')for(const address of Object.values(networkInterfaces()).flat()) {
      if(address.family==='IPv4' && !address.internal)console.log(`Network: http://${address.address}:${port}`);
    }
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
  process.stdin.on('data', chunk => { if (chunk.toString().trim() === 'stop') server.close(() => process.exit(0)); });
}
