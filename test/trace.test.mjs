import test from 'node:test';
import assert from 'node:assert/strict';
import { durationUnion, analyzeTrace } from '../scripts/trace-metrics.mjs';
test('nested layer paint intervals do not double count parent time', () => {
  assert.equal(
    durationUnion([
      [0, 10],
      [2, 4],
      [7, 12],
      [20, 25],
      [25, 27],
    ]),
    19,
  );
});
test('empty and zero-length intervals do not create duration', () => {
  assert.equal(durationUnion([]), 0);
  assert.equal(
    durationUnion([
      [1, 1],
      [3, 2],
    ]),
    0,
  );
});
test('trace analysis excludes other renderers and clips work before operation marker', () => {
  const metrics = analyzeTrace({
    traceEvents: [
      { name: 'bench:operation-start', cat: 'blink.user_timing', pid: 1, tid: 2, ts: 1000 },
      { name: 'Paint', pid: 1, tid: 2, ts: 500, dur: 1500, ph: 'X' },
      { name: 'Paint', pid: 1, tid: 2, ts: 1500, dur: 1000, ph: 'X' },
      { name: 'Paint', pid: 9, tid: 2, ts: 1000, dur: 90000, ph: 'X' },
      { name: 'Paint', pid: 1, tid: 3, ts: 1000, dur: 90000, ph: 'X' },
      { name: 'Layout', pid: 1, tid: 2, ts: 2500, dur: 500, ph: 'X' },
    ],
  });
  assert.equal(metrics.paintMs, 1.5);
  assert.equal(metrics.layoutMs, 0.5);
  assert.equal(metrics.paintEvents, 2);
});
test('a marker is required rather than guessing the active renderer', () => {
  assert.throws(() => analyzeTrace({ traceEvents: [] }), /marker missing/);
});
