import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { analyzeTrace } from './trace-metrics.mjs';
const report = JSON.parse(await readFile('results/latest.json', 'utf8')),
  existing = report.paintDiagnostics ?? [],
  rows = [];
for (const trace of report.traces) {
  let data;
  try {
    data = await readFile(trace.file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const saved = existing.find((row) => row.sha256 === trace.sha256);
    if (!saved) throw new Error('Trace missing and no saved analysis: ' + trace.file);
    rows.push(saved);
    continue;
  }
  if (createHash('sha256').update(data).digest('hex') !== trace.sha256)
    throw new Error('Trace checksum changed: ' + trace.file);
  rows.push({ ...trace, ...analyzeTrace(JSON.parse(data)) });
}
report.paintDiagnostics = rows;
await writeFile('results/paint.json', JSON.stringify(rows, null, 2) + '\n');
await writeFile('results/latest.json', JSON.stringify(report, null, 2) + '\n');
console.log('Analyzed', rows.length, 'renderer-specific paint traces');
