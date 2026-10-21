// Test-only release simulation. It changes the served worker in memory, never source files.
import path from 'node:path';
import { createAppServer } from '../scripts/serve.mjs';
let release = 0;
const server = createAppServer({
  beforeRequest(req, res) {
    if (req.url !== '/__test__/release') return false;
    if (req.method === 'POST') release++;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ release }));
    return true;
  },
  transform(target, content) {
    if (path.basename(target) === 'sw.js' && release) return content.toString().replace(/const CACHE = '[^']+';/, `const CACHE = 'form-shell-test-${release}';`);
    return content;
  }
});
const port = Number(process.env.PORT || 4173);
server.listen(port, '127.0.0.1', () => console.log(`Form test server: http://localhost:${port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
process.stdin.on('data', chunk => { if (chunk.toString().trim() === 'stop') server.close(() => process.exit(0)); });
