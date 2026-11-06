import assert from 'node:assert/strict';
import { writeFile, mkdir } from 'node:fs/promises';
import { cases } from '../src/shared/cases.ts';
import { makeModel, apply, oracle } from '../src/shared/model.ts';
import { buildAll } from './build.mjs';
import { serve } from './server.mjs';
import { launch, open, frameworks, prepare, operate, validate } from './harness.mjs';
await buildAll();
const server = await serve(),
  browser = await launch();
const results = [];
try {
  for (const item of cases.filter((item) => item.fixture.scene !== 'route')) {
    const mutable = makeModel(item.fixture),
      original = makeModel(item.fixture),
      before = oracle(original);
    const immutable = apply(original, item.command, true);
    apply(mutable, item.command);
    assert.deepEqual(oracle(mutable), oracle(immutable), `adapter parity: ${item.id}`);
    assert.deepEqual(oracle(original), before, `immutable input: ${item.id}`);
  }
  for (const framework of frameworks) {
    const { page, context, errors } = await open(browser, server.url, framework);
    try {
      for (const item of cases) {
        await prepare(page, item);
        if (['list-swap', 'list-update-1000', 'list-remove', 'list-select'].includes(item.id))
          await page.evaluate(() => {
            window.__nodes = new Map(
              [...document.querySelectorAll('#rows > tr')].map((row) => [
                row.getAttribute('data-id'),
                row,
              ]),
            );
          });
        if (item.fixture.scene === 'route')
          await page.evaluate(() => {
            window.__routeNode = document.getElementById('route-page');
          });
        const before = await page.evaluate(() => ({ ...window.__bench.lifecycle }));
        await operate(page, item, { click: true });
        await validate(page, item);
        if (['list-swap', 'list-update-1000', 'list-remove', 'list-select'].includes(item.id))
          assert.ok(
            await page.evaluate(() => {
              const ok = [...document.querySelectorAll('#rows > tr')].every(
                (row) => window.__nodes.get(row.getAttribute('data-id')) === row,
              );
              delete window.__nodes;
              return ok;
            }),
            `${framework}/${item.id}: keyed identity`,
          );
        if (item.fixture.scene === 'route')
          assert.equal(
            await page.evaluate(() => {
              const same = window.__routeNode === document.getElementById('route-page');
              delete window.__routeNode;
              return same;
            }),
            item.id !== 'route-page',
            `${framework}/${item.id}: route reuse`,
          );
        const after = await page.evaluate(() => ({ ...window.__bench.lifecycle }));
        if (item.id === 'mount-create') assert.equal(after.mounted - before.mounted, 500);
        if (item.id === 'mount-destroy') assert.equal(after.unmounted - before.unmounted, 500);
        assert.deepEqual(errors, []);
        results.push({ framework, case: item.id, passed: true });
        console.log('PASS', framework, item.id);
      }
    } finally {
      await context.close();
    }
  }
  await mkdir('results', { recursive: true });
  await writeFile(
    'results/verification.json',
    JSON.stringify({ date: new Date().toISOString(), checks: results.length, results }, null, 2) +
      '\n',
  );
  console.log(`All ${results.length} browser cases and model parity passed.`);
} finally {
  await browser.close();
  await server.close();
}
