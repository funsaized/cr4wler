import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
export function serve(port = 4173) {
  const root = resolve('dist');
  const server = http.createServer(async (req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + (name === '/' ? '/playground.html' : name));
    if (!file.startsWith(root + '/')) {
      res.writeHead(403).end();
      return;
    }
    try {
      const bytes = await readFile(file);
      res.writeHead(200, {
        'Content-Type':
          {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.png': 'image/png',
            '.svg': 'image/svg+xml',
          }[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(bytes);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
if (process.argv[1]?.endsWith('/serve.mjs')) {
  await serve();
  console.log('Cr4wler playground → http://127.0.0.1:4173');
}
