import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { serve } from './server.mjs';
import { launch, open } from './harness.mjs';
const framework = process.argv[2] ?? 'jinge';
if (!['jinge', 'vue', 'react'].includes(framework)) throw new Error('Expected jinge, vue or react');
const server = await serve(),
  browser = await launch(),
  notes = {
    framework,
    browser: browser.version(),
    created: new Date().toISOString(),
    snapshots: [],
  };
try {
  const { page, context } = await open(browser, server.url, framework);
  const cdp = await context.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await page.evaluate(() => window.__bench.prepare({ scene: 'mount', count: 50 }));
  async function snapshot(label) {
    await page.evaluate(() => {
      performance.clearMarks();
      window.__bench.events.length = 0;
      window.__bench.longTasks.length = 0;
    });
    await cdp.send('HeapProfiler.collectGarbage');
    let data = '';
    const chunk = ({ chunk }) => (data += chunk);
    cdp.on('HeapProfiler.addHeapSnapshotChunk', chunk);
    try {
      await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    } finally {
      cdp.off('HeapProfiler.addHeapSnapshotChunk', chunk);
    }
    const file = `results/${framework}-${label}.heapsnapshot`;
    await writeFile(file, data);
    const parsed = JSON.parse(data),
      fields = parsed.snapshot.meta.node_fields,
      width = fields.length,
      types = parsed.snapshot.meta.node_types[0],
      counts = {};
    for (let offset = 0; offset < parsed.nodes.length; offset += width) {
      const type = types[parsed.nodes[offset]],
        name = parsed.strings[parsed.nodes[offset + fields.indexOf('name')]];
      if (type === 'object' && ['Object', 'Array', 'Map', 'Set', 'ComponentHost'].includes(name)) {
        counts[name] ??= { count: 0, selfBytes: 0 };
        counts[name].count++;
        counts[name].selfBytes += parsed.nodes[offset + fields.indexOf('self_size')];
      }
    }
    notes.snapshots.push({
      label,
      file,
      sha256: createHash('sha256').update(data).digest('hex'),
      bytes: data.length,
      counts,
    });
    console.log('SNAPSHOT', file);
  }
  await snapshot('before');
  await page.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      await window.__bench.run({ type: 'visible', value: true });
      await window.__bench.run({ type: 'visible', value: false });
    }
    await window.__bench.quiet();
  });
  await snapshot('after-100');
  await writeFile(`results/${framework}-heap-notes.json`, JSON.stringify(notes, null, 2) + '\n');
  await context.close();
} finally {
  await browser.close();
  await server.close();
}
