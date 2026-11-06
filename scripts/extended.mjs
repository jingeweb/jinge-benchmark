import { build } from 'vite';
import { jingeVitePlugin } from 'jinge-compiler';
import react from '@vitejs/plugin-react';
import vue from '@vitejs/plugin-vue-jsx';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root } from './build.mjs';
import { serve } from './server.mjs';
import { launch, open, frameworks, summarize } from './harness.mjs';
const result = JSON.parse(await readFile('results/latest.json', 'utf8'));
if (!result.completed) throw new Error('Complete the main benchmark first');
const trials = Number(process.env.BENCH_GESTURE_TRIALS ?? 3),
  steps = 30;
for (const [fw, plugins] of [
  ['jinge', [jingeVitePlugin()]],
  ['vue', [vue()]],
  ['react', [react()]],
]) {
  const directory = path.join(root, 'src', fw + '-gestures');
  await writeFile(
    path.join(directory, 'index.html'),
    '<!doctype html><html><head><meta charset="utf-8"><title>Gestures</title></head><body><div id="app"></div><script type="module" src="./main.tsx"></script></body></html>',
  );
  await build({
    root: directory,
    configFile: false,
    base: `/${fw}-gestures/`,
    plugins,
    logLevel: 'warn',
    build: { outDir: path.join(root, 'dist', fw + '-gestures'), emptyOutDir: true, minify: true },
  });
}
const server = await serve(),
  browser = await launch();
const extended = {
  started: new Date().toISOString(),
  completed: null,
  browser: browser.version(),
  gestureTrials: trials,
  steps,
  gestures: [],
  startupCPU: [],
};
try {
  if (extended.browser !== result.environment.browser) throw new Error('Browser version changed');
  for (const kind of ['scroll-passive', 'scroll-bound', 'drag'])
    for (const fw of frameworks) {
      const samples = [];
      for (let trial = 0; trial < trials; trial++) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        try {
          const page = await context.newPage(),
            errors = [];
          page.on('pageerror', (e) => errors.push(e.message));
          const cdp = await context.newCDPSession(page);
          await cdp.send('Performance.enable');
          if (result.environment.cpuThrottle !== 1)
            await cdp.send('Emulation.setCPUThrottlingRate', {
              rate: result.environment.cpuThrottle,
            });
          await page.goto(`${server.url}/${fw}-gestures/`);
          await page.waitForFunction(() => window.__gesture?.ready);
          await page.evaluate(
            (mode) => window.__gesture.begin(mode),
            kind === 'scroll-passive' ? 'passive' : 'bound',
          );
          if (kind.startsWith('scroll')) {
            await page.mouse.move(200, 100);
            for (let i = 0; i < steps; i++) {
              const expected = i % 2 === 0 ? 120 : 0;
              await page.mouse.wheel(0, i % 2 === 0 ? 120 : -120);
              await page.waitForFunction(
                (expected) => document.getElementById('scroller').scrollTop === expected,
                expected,
              );
              if (kind === 'scroll-bound')
                await page.waitForFunction(
                  (expected) =>
                    document.getElementById('scroll-value').textContent === String(expected),
                  expected,
                );
            }
          } else {
            await page.mouse.move(45, 340);
            await page.mouse.down();
            for (let i = 1; i <= steps; i++) {
              const x = i * 8;
              await page.mouse.move(45 + x, 340);
              await page.waitForFunction(
                (x) => document.getElementById('drag-value').textContent === String(x),
                x,
              );
            }
            await page.mouse.up();
            assert.equal(
              await page.locator('#thumb').evaluate((el) => el.style.transform),
              'translateX(240px)',
            );
          }
          await page.evaluate(
            () =>
              new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
          );
          const data = await page.evaluate(() => window.__gesture.end());
          assert.deepEqual(errors, []);
          assert.ok(data.samples.length >= steps, `${fw}/${kind}: no events`);
          samples.push(data);
        } finally {
          await context.close();
        }
      }
      const entries = samples.flatMap((s) => s.samples);
      extended.gestures.push({
        framework: fw,
        id: kind,
        trials: samples,
        dom: entries.some((s) => s.domMs !== null)
          ? summarize(entries.filter((s) => s.domMs !== null).map((s) => s.domMs))
          : null,
        eventAge: summarize(entries.map((s) => s.eventAgeMs)),
        raf: summarize(entries.filter((s) => s.rafMs !== undefined).map((s) => s.rafMs)),
        interval: summarize(samples.flatMap((s) => s.intervals)),
      });
      console.log('GESTURE', fw, kind);
    }
  for (const boot of ['empty', 'table', 'form'])
    for (const fw of frameworks) {
      const values = [];
      for (let i = 0; i < 3; i++) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        try {
          const page = await context.newPage(),
            cdp = await context.newCDPSession(page);
          await cdp.send('Performance.enable');
          await cdp.send('Network.enable');
          await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
          if (result.environment.cpuThrottle !== 1)
            await cdp.send('Emulation.setCPUThrottlingRate', {
              rate: result.environment.cpuThrottle,
            });
          await page.goto(`${server.url}/${fw}/?boot=${boot}`);
          await page.waitForFunction(() => window.__bench?.ready);
          await page.evaluate(() => window.__bench.quiet());
          const metrics = Object.fromEntries(
            (await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]),
          );
          values.push(
            Object.fromEntries(
              ['ScriptDuration', 'TaskDuration', 'LayoutDuration', 'RecalcStyleDuration'].map(
                (name) => [name, metrics[name] * 1000],
              ),
            ),
          );
        } finally {
          await context.close();
        }
      }
      extended.startupCPU.push({
        framework: fw,
        boot,
        samples: values,
        median: Object.fromEntries(
          Object.keys(values[0]).map((name) => [
            name,
            summarize(values.map((v) => v[name])).median,
          ]),
        ),
      });
      console.log('STARTUP CPU', fw, boot);
    }
  extended.completed = new Date().toISOString();
  result.extended = extended;
  await writeFile('results/latest.json', JSON.stringify(result, null, 2) + '\n');
  await writeFile('results/extended.json', JSON.stringify(extended, null, 2) + '\n');
} finally {
  await browser.close();
  await server.close();
}
