import { chromium } from 'playwright';
import assert from 'node:assert/strict';
export const frameworks = ['jinge', 'vue', 'react'];
export async function launch() {
  return chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome',
    headless: true,
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
}
export async function open(browser, url, framework, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${url}/${framework}/${options.query ?? ''}`);
  await page.waitForFunction(() => window.__bench?.ready);
  await page.evaluate(() => window.__bench.quiet());
  if (errors.length) throw new Error(errors.join('\n'));
  return { page, context, errors };
}
export async function prepare(page, item) {
  await page.evaluate((fixture) => window.__bench.prepare(fixture), item.fixture);
}
export async function operate(page, item, { click = false } = {}) {
  if (item.command.type === 'input') {
    await page.locator('#input-0').focus();
    await page.locator('#input-0').press('ControlOrMeta+A');
    await page.evaluate(() => {
      window.__bench.result = undefined;
    });
    await page.locator('#input-0').press('1');
    return await page.evaluate(() => {
      if (!window.__bench.result) throw new Error('input handler did not run');
      return window.__bench.result;
    });
  }
  if (click) {
    await page.evaluate((command) => {
      window.__bench.result = undefined;
      window.__bench.stage(command);
    }, item.command);
    await page.locator('#run').click();
    return await page.evaluate(() => window.__bench.result);
  }
  return await page.evaluate((command) => window.__bench.run(command), item.command);
}
export async function validate(page, item) {
  await page.evaluate(() => window.__bench.quiet());
  const result = await page.evaluate(() => ({
    actual: window.__bench.snapshot(),
    expected: window.__bench.expected(),
  }));
  if (item.fixture.scene === 'route') {
    const target = String(item.command.value);
    assert.deepEqual(
      result.actual,
      target.includes('/other')
        ? ['other', undefined, undefined]
        : ['user', target.includes('/2') ? '2' : '1', target.includes('tab=b') ? 'b' : 'a'],
      item.id,
    );
  } else assert.deepEqual(result.actual, result.expected, item.id);
}
export function summarize(values) {
  const sorted = values.toSorted((a, b) => a - b);
  const quantile = (p) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
  return {
    n: values.length,
    min: sorted[0],
    median: quantile(0.5),
    p95: quantile(0.95),
    max: sorted.at(-1),
    mean: values.reduce((a, b) => a + b, 0) / values.length,
  };
}
