import { build } from 'vite';
import { jingeVitePlugin } from 'jinge-compiler';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue-jsx';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
export const root = path.resolve(import.meta.dirname, '..');
export async function buildAll() {
  const artifacts = {};
  for (const [framework, plugins] of [
    ['jinge', [jingeVitePlugin()]],
    ['vue', [vue()]],
    ['react', [react()]],
  ]) {
    const directory = path.join(root, 'src', framework);
    await writeFile(
      path.join(directory, 'index.html'),
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Benchmark</title></head><body><div id="app"></div><script type="module" src="./main.tsx"></script></body></html>`,
    );
    const start = performance.now();
    await build({
      root: directory,
      configFile: false,
      base: `/${framework}/`,
      plugins,
      logLevel: 'warn',
      resolve: { dedupe: ['jinge', 'react', 'react-dom', 'vue'] },
      build: {
        outDir: path.join(root, 'dist', framework),
        emptyOutDir: true,
        sourcemap: false,
        minify: true,
      },
    });
    let js = 0,
      gzip = 0,
      css = 0;
    const files = [];
    async function scan(dir) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) await scan(file);
        else {
          const data = await readFile(file);
          files.push({
            file: path.relative(path.join(root, 'dist', framework), file),
            bytes: data.length,
            gzip: gzipSync(data).length,
          });
          if (file.endsWith('.js')) {
            js += data.length;
            gzip += gzipSync(data).length;
          } else if (file.endsWith('.css')) css += data.length;
        }
      }
    }
    await scan(path.join(root, 'dist', framework));
    artifacts[framework] = { js, gzip, css, files, buildMs: performance.now() - start };
  }
  await mkdir(path.join(root, 'results'), { recursive: true });
  await writeFile(
    path.join(root, 'results/artifacts.json'),
    JSON.stringify(artifacts, null, 2) + '\n',
  );
  return artifacts;
}
if (process.argv[1] === import.meta.filename) await buildAll();
