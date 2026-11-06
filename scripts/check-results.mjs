import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cases } from '../src/shared/cases.ts';
const report = JSON.parse(await readFile('results/latest.json', 'utf8'));
const verification = JSON.parse(await readFile('results/verification.json', 'utf8'));
assert.ok(report.completed && report.extended?.completed, 'all measurements must complete');
assert.equal(verification.checks, cases.length * 3);
assert.equal(verification.results.filter((item) => item.passed).length, verification.checks);
assert.equal(
  new Set(report.operations.map((item) => `${item.framework}/${item.id}`)).size,
  cases.length * 3,
);
for (const framework of ['jinge', 'vue', 'react'])
  for (const item of cases) {
    const measurement = report.operations.find(
      (row) => row.framework === framework && row.id === item.id,
    );
    assert.equal(measurement.samples.length, report.config.samples);
    assert.ok(
      measurement.samples.every((sample) => Number.isFinite(sample.domMs) && sample.domMs >= 0),
    );
  }
assert.equal(report.startup.length, 18);
for (const item of report.startup) {
  assert.equal(item.samples.length, report.config.startupSamples);
  assert.ok(item.samples.every((sample) => sample.readyMs > 0));
}
assert.equal(report.diagnostics.length, cases.length * 3);
assert.equal(report.continuous.length, 9);
for (const item of report.continuous)
  for (const trial of item.trials) {
    assert.equal(trial.intervals.length, report.config.frameCount);
    assert.equal(trial.updates.length, report.config.frameCount);
  }
assert.equal(report.memory.length, 21);
for (const item of report.memory)
  for (const trial of item.trials) {
    if (item.id === 'mount-100' || item.id === 'route-100') {
      assert.deepEqual(
        trial.checkpoints.map((point) => point.cycles),
        [10, 50, 100],
      );
    }
    if (item.id === 'mount-100')
      assert.deepEqual(trial.lifecycle, { mounted: 5000, unmounted: 5000 });
    if (item.id === 'route-100')
      assert.deepEqual(trial.lifecycle, { mounted: 201, unmounted: 200 });
  }
assert.equal(report.extended.gestures.length, 9);
assert.equal(report.extended.startupCPU.length, 9);
for (const gesture of report.extended.gestures) {
  assert.equal(gesture.trials.length, report.extended.gestureTrials);
  assert.ok(gesture.trials.every((trial) => trial.samples.length >= report.extended.steps));
}
let checkedTraces = 0;
for (const trace of report.traces) {
  try {
    await access(trace.file);
  } catch {
    continue;
  } // Large optional local artifacts are gitignored.
  assert.equal(
    createHash('sha256')
      .update(await readFile(trace.file))
      .digest('hex'),
    trace.sha256,
  );
  checkedTraces++;
}
for (const framework of ['jinge', 'vue', 'react'])
  for (const file of report.artifacts[framework].files) {
    try {
      await access(`dist/${framework}/${file.file}`);
    } catch {
      continue;
    }
    assert.equal(
      (await readFile(`dist/${framework}/${file.file}`)).length,
      file.bytes,
      'measured bundle changed',
    );
  }
console.log(
  `Raw data coverage, sample counts, lifecycle counts, bundles and ${checkedTraces} local trace hashes verified.`,
);
