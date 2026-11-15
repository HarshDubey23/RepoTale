// A static file server, so the example needs nothing installed.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const dir = new URL('.', import.meta.url).pathname, port = +(process.env.PORT ?? 4321);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
createServer(async (req, res) => {
  const path = join(dir, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!path.startsWith(dir)) return res.writeHead(403).end();
  try { res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(await readFile(path)); }
  catch { res.writeHead(404).end('not found'); }
}).listen(port, () => console.log(`Readable on http://localhost:${port}`));
