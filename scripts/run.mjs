import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { cases, frames } from '../src/shared/cases.ts';
import { buildAll } from './build.mjs';
import { serve } from './server.mjs';
import { launch, open, frameworks, prepare, operate, validate, summarize } from './harness.mjs';
const samples = Number(process.env.BENCH_SAMPLES ?? 30),
  warmup = Number(process.env.BENCH_WARMUP ?? 5),
  cpu = Number(process.env.BENCH_CPU ?? 1);
const startupSamples = Number(process.env.BENCH_STARTUP_SAMPLES ?? 30),
  memorySamples = Number(process.env.BENCH_MEMORY_SAMPLES ?? 3),
  frameTrials = Number(process.env.BENCH_FRAME_TRIALS ?? 3);
for (const [name, value, min] of [
  ['BENCH_SAMPLES', samples, 1],
  ['BENCH_WARMUP', warmup, 0],
  ['BENCH_STARTUP_SAMPLES', startupSamples, 1],
  ['BENCH_MEMORY_SAMPLES', memorySamples, 1],
  ['BENCH_FRAME_TRIALS', frameTrials, 1],
]) {
  if (!Number.isInteger(value) || value < min)
    throw new Error(`${name} must be an integer >= ${min}`);
}
if (!Number.isFinite(cpu) || cpu < 1) throw new Error('BENCH_CPU must be >= 1');
const only = process.env.BENCH_ONLY?.split(',').map((group) => group.trim());
if (
  only?.some(
    (group) => !['operations', 'startup', 'diagnostics', 'continuous', 'memory'].includes(group),
  )
)
  throw new Error('Unknown BENCH_ONLY category');
const enabled = (group) => !only || only.includes(group);
const artifacts = await buildAll(),
  server = await serve(),
  browser = await launch();
const versions = {};
for (const name of [
  'jinge',
  'jinge-compiler',
  'jinge-router',
  'react',
  'react-dom',
  'react-router-dom',
  'vue',
  'vue-router',
  'vite',
  'playwright',
])
  versions[name] = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8')).version;
const report = {
  schema: 1,
  started: new Date().toISOString(),
  completed: null,
  environment: {
    platform: os.platform(),
    osRelease: os.release(),
    arch: os.arch(),
    cpu: os.cpus()[0].model,
    logicalCPUs: os.cpus().length,
    memoryGiB: os.totalmem() / 1024 ** 3,
    node: process.version,
    pnpm: execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(),
    browser: browser.version(),
    headless: true,
    viewport: '1280×900',
    cpuThrottle: cpu,
    network: 'localhost HTTP, uncompressed; no network throttling',
    versions,
  },
  config: { samples, warmup, startupSamples, memorySamples, frameTrials, frameCount: 60 },
  artifacts,
  operations: [],
  startup: [],
  diagnostics: [],
  continuous: [],
  memory: [],
  traces: [],
};
const save = () => writeFile('results/latest.json', JSON.stringify(report, null, 2) + '\n');
await mkdir('results/traces', { recursive: true });
async function session(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  if (cpu !== 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  return cdp;
}
async function metrics(cdp) {
  return Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]),
  );
}
function difference(before, after) {
  const result = {};
  for (const name of ['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration'])
    result[name] = (after[name] - before[name]) * 1000;
  for (const name of ['LayoutCount', 'RecalcStyleCount']) result[name] = after[name] - before[name];
  return result;
}
async function heap(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const memory = await cdp.send('Runtime.getHeapUsage'),
    dom = await cdp.send('Memory.getDOMCounters');
  return {
    usedBytes: memory.usedSize,
    nodes: dom.nodes,
    documents: dom.documents,
    listeners: dom.jsEventListeners,
  };
}
async function trace(page, cdp, fw, item) {
  await prepare(page, item);
  await cdp.send('Tracing.start', {
    categories: 'devtools.timeline,blink.user_timing,v8',
    transferMode: 'ReturnAsStream',
  });
  await operate(page, item);
  await page.evaluate(() => window.__bench.quiet());
  const complete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
  await cdp.send('Tracing.end');
  const { stream } = await complete;
  let data = '';
  for (;;) {
    const chunk = await cdp.send('IO.read', { handle: stream });
    data += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString() : chunk.data;
    if (chunk.eof) break;
  }
  await cdp.send('IO.close', { handle: stream });
  const file = `results/traces/${fw}-${item.id}.json`;
  await writeFile(file, data);
  report.traces.push({
    framework: fw,
    id: item.id,
    file,
    sha256: createHash('sha256').update(data).digest('hex'),
  });
}
try {
  if (enabled('operations') || enabled('diagnostics')) {
    const pages = {};
    for (const fw of frameworks) {
      pages[fw] = await open(browser, server.url, fw);
      pages[fw].cdp = await session(pages[fw].page);
    }
    try {
      for (const item of cases) {
        if (enabled('operations')) {
          const values = Object.fromEntries(frameworks.map((fw) => [fw, []]));
          for (let round = -warmup; round < samples; round++)
            for (let order = 0; order < frameworks.length; order++) {
              const fw = frameworks[(round + warmup + order) % frameworks.length],
                { page, errors } = pages[fw];
              await page.bringToFront();
              await prepare(page, item);
              await page.evaluate(() => {
                window.__bench.events.length = 0;
                window.__bench.longTasks.length = 0;
              });
              const elapsed = await operate(page, item, { click: true });
              await validate(page, item);
              if (errors.length) throw new Error(`${fw}/${item.id}: ${errors.join(';')}`);
              const observation = await page.evaluate(() => ({
                events: window.__bench.events,
                longTasks: window.__bench.longTasks,
              }));
              const event = observation.events
                .filter((event) =>
                  item.command.type === 'input' ? event.name === 'keydown' : event.name === 'click',
                )
                .at(-1);
              if (round >= 0)
                values[fw].push({
                  domMs: elapsed,
                  eventMs: event?.duration ?? null,
                  inputDelayMs: event?.inputDelay ?? null,
                  eventProcessingMs: event?.processing ?? null,
                  longTasks: observation.longTasks,
                });
            }
          for (const fw of frameworks)
            report.operations.push({
              framework: fw,
              id: item.id,
              group: item.group,
              label: item.label,
              samples: values[fw],
              dom: summarize(values[fw].map((v) => v.domMs)),
              event: values[fw].some((v) => v.eventMs !== null)
                ? summarize(values[fw].filter((v) => v.eventMs !== null).map((v) => v.eventMs))
                : null,
            });
          console.log('MEASURED', item.id);
          await save();
        }
        if (enabled('diagnostics'))
          for (const fw of frameworks) {
            const { page, cdp } = pages[fw],
              trials = [];
            for (let i = 0; i < 3; i++) {
              await page.bringToFront();
              await prepare(page, item);
              const before = await metrics(cdp);
              await operate(page, item);
              await page.evaluate(() => window.__bench.quiet());
              const after = await metrics(cdp);
              trials.push(difference(before, after));
              await validate(page, item);
            }
            if (
              process.env.BENCH_TRACES !== '0' &&
              [
                'list-create-10000',
                'list-update-10000',
                'binding-one-10000',
                'mount-destroy',
                'route-page',
                'form-input-200',
              ].includes(item.id)
            )
              await trace(page, cdp, fw, item);
            report.diagnostics.push({
              framework: fw,
              id: item.id,
              label: item.label,
              trials,
              median: Object.fromEntries(
                Object.keys(trials[0]).map((key) => [
                  key,
                  summarize(trials.map((t) => t[key])).median,
                ]),
              ),
            });
          }
      }
    } finally {
      for (const fw of frameworks) await pages[fw].context.close();
    }
  }
  if (enabled('startup'))
    for (const boot of ['empty', 'table', 'form'])
      for (const cache of ['cold', 'warm']) {
        const values = Object.fromEntries(frameworks.map((fw) => [fw, []]));
        for (let round = 0; round < startupSamples; round++)
          for (let order = 0; order < 3; order++) {
            const fw = frameworks[(round + order) % 3];
            const context = await browser.newContext({
              viewport: { width: 1280, height: 900 },
              locale: 'en-US',
            });
            try {
              const page = await context.newPage(),
                cdp = await session(page);
              await cdp.send('Network.enable');
              await cdp.send('Network.setCacheDisabled', { cacheDisabled: cache === 'cold' });
              const url = `${server.url}/${fw}/?boot=${boot}`;
              if (cache === 'warm') {
                await page.goto(url);
                await page.waitForFunction(() => window.__bench?.ready);
                await page.evaluate(() => window.__bench.quiet());
              }
              await page.goto(url);
              await page.waitForFunction(() => window.__bench?.ready);
              await page.evaluate(() => window.__bench.quiet());
              values[fw].push(
                await page.evaluate(() => ({
                  readyMs: performance.getEntriesByName('bench:ready').at(-1).startTime,
                  fcpMs:
                    performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
                  transferBytes: performance
                    .getEntriesByType('resource')
                    .reduce((sum, r) => sum + r.transferSize, 0),
                })),
              );
            } finally {
              await context.close();
            }
          }
        for (const fw of frameworks)
          report.startup.push({
            framework: fw,
            boot,
            cache,
            samples: values[fw],
            ready: summarize(values[fw].map((v) => v.readyMs)),
            fcp: values[fw].some((v) => v.fcpMs !== null)
              ? summarize(values[fw].filter((v) => v.fcpMs !== null).map((v) => v.fcpMs))
              : null,
          });
        console.log('STARTUP', boot, cache);
        await save();
      }
  if (enabled('continuous'))
    for (const item of frames)
      for (const fw of frameworks) {
        const { page, context } = await open(browser, server.url, fw);
        await session(page);
        const trials = [];
        try {
          for (let trial = 0; trial < frameTrials; trial++) {
            await prepare(page, item);
            const result = await page.evaluate(async (item) => {
              const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
              const idle = [];
              let last = await raf();
              for (let i = 0; i < 20; i++) {
                const now = await raf();
                idle.push(now - last);
                last = now;
              }
              const baseline = idle.toSorted((a, b) => a - b)[Math.floor(idle.length / 2)];
              const intervals = [],
                updates = [];
              last = await raf();
              for (let i = 0; i < 60; i++) {
                const timestamp = await raf();
                intervals.push(timestamp - last);
                last = timestamp;
                const start = performance.now();
                if (item.id === 'frames-input') await window.__bench.input(String(i + 1));
                else await window.__bench.run(item.command);
                updates.push(performance.now() - start);
              }
              await window.__bench.quiet();
              return {
                baseline,
                intervals,
                updates,
                overBudget: intervals.filter((ms) => ms > baseline * 1.5).length,
              };
            }, item);
            trials.push(result);
          }
          report.continuous.push({
            framework: fw,
            id: item.id,
            label: item.label,
            trials,
            interval: summarize(trials.flatMap((t) => t.intervals)),
            update: summarize(trials.flatMap((t) => t.updates)),
            overBudget: trials.reduce((s, t) => s + t.overBudget, 0),
            baseline: summarize(trials.map((t) => t.baseline)).median,
          });
          console.log('FRAMES', fw, item.id);
          await save();
        } finally {
          await context.close();
        }
      }
  const memoryCases = [
    ['ready', 'table', 0],
    ['rows-1000', 'table', 1000],
    ['rows-10000', 'table', 10000],
    ['replace-5', 'table', 1000],
    ['clear-10000', 'table', 10000],
    ['mount-100', 'mount', 50],
    ['route-100', 'route', 0],
  ];
  if (enabled('memory'))
    for (const [id, scene, count] of memoryCases)
      for (const fw of frameworks) {
        const trials = [];
        for (let trial = 0; trial < memorySamples; trial++) {
          const { page, context } = await open(browser, server.url, fw);
          const cdp = await session(page);
          try {
            await page.evaluate(
              (scene) => window.__bench.prepare({ scene, count: scene === 'mount' ? 50 : 0 }),
              scene,
            );
            await page.evaluate(() => {
              performance.clearMarks();
              performance.clearMeasures();
              window.__bench.events.length = 0;
              window.__bench.longTasks.length = 0;
            });
            const before = await heap(cdp),
              checkpoints = [];
            if (id === 'mount-100' || id === 'route-100') {
              let previous = 0;
              for (const checkpoint of [10, 50, 100]) {
                await page.evaluate(
                  async ({ id, iterations }) => {
                    const bench = window.__bench;
                    for (let i = 0; i < iterations; i++)
                      if (id === 'mount-100') {
                        await bench.run({ type: 'visible', value: true });
                        await bench.run({ type: 'visible', value: false });
                      } else {
                        await bench.run({ type: 'route', value: '/case/other' });
                        await bench.run({ type: 'route', value: '/case/user/1?tab=a' });
                      }
                    await bench.quiet();
                    performance.clearMarks();
                    performance.clearMeasures();
                    bench.events.length = 0;
                    bench.longTasks.length = 0;
                  },
                  { id, iterations: checkpoint - previous },
                );
                checkpoints.push({ cycles: checkpoint, ...(await heap(cdp)) });
                previous = checkpoint;
              }
            } else
              await page.evaluate(
                async ({ id, scene, count }) => {
                  const bench = window.__bench;
                  if (count && scene === 'table') await bench.run({ type: 'rows', count });
                  if (id === 'replace-5')
                    for (let i = 1; i <= 5; i++)
                      await bench.run({ type: 'rows', count: 1000, index: i });
                  if (id === 'clear-10000') await bench.run({ type: 'clear' });
                  await bench.quiet();
                  performance.clearMarks();
                  performance.clearMeasures();
                  bench.events.length = 0;
                  bench.longTasks.length = 0;
                },
                { id, scene, count },
              );
            const after = await heap(cdp);
            const life = await page.evaluate(() => ({ ...window.__bench.lifecycle }));
            if (id === 'mount-100' && (life.mounted !== 5000 || life.unmounted !== 5000))
              throw new Error('lifecycle count mismatch ' + JSON.stringify(life));
            if (id === 'route-100' && (life.mounted !== 201 || life.unmounted !== 200))
              throw new Error('route count mismatch ' + JSON.stringify(life));
            trials.push({
              before,
              after,
              checkpoints,
              delta: Object.fromEntries(
                Object.keys(before).map((key) => [key, after[key] - before[key]]),
              ),
              lifecycle: life,
            });
          } finally {
            await context.close();
          }
        }
        report.memory.push({
          framework: fw,
          id,
          trials,
          heap: summarize(trials.map((t) => t.after.usedBytes)),
          delta: summarize(trials.map((t) => t.delta.usedBytes)),
          nodes: summarize(trials.map((t) => t.after.nodes)),
          nodeDelta: summarize(trials.map((t) => t.delta.nodes)),
          listenerDelta: summarize(trials.map((t) => t.delta.listeners)),
        });
        console.log('MEMORY', fw, id);
        await save();
      }
  report.completed = new Date().toISOString();
  await save();
  console.log('Benchmark complete:', report.completed);
} finally {
  await browser.close();
  await server.close();
}
