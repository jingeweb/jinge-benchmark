import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './build.mjs';
export async function serve() {
  const server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const framework = pathname.split('/')[1];
      if (
        !['jinge', 'vue', 'react', 'jinge-gestures', 'vue-gestures', 'react-gestures'].includes(
          framework,
        )
      ) {
        res.writeHead(404);
        res.end();
        return;
      }
      let file = path.resolve(root, 'dist', '.' + pathname);
      if (!file.startsWith(path.join(root, 'dist') + path.sep)) throw new Error('bad path');
      if (!path.extname(file)) file = path.join(root, 'dist', framework, 'index.html');
      const data = await readFile(file);
      res.setHeader(
        'Content-Type',
        file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html',
      );
      res.setHeader('Cache-Control', 'public,max-age=3600');
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
