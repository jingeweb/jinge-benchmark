// Union nested/overlapping main-thread intervals instead of double-counting them.
export function durationUnion(intervals) {
  const sorted = intervals.filter(([a, b]) => b > a).toSorted((a, b) => a[0] - b[0]);
  let sum = 0,
    start,
    end;
  for (const [a, b] of sorted) {
    if (start === undefined) {
      start = a;
      end = b;
    } else if (a <= end) end = Math.max(end, b);
    else {
      sum += end - start;
      start = a;
      end = b;
    }
  }
  return sum + (start === undefined ? 0 : end - start);
}
export function analyzeTrace(trace) {
  const events = trace.traceEvents;
  const start = events.find(
    (event) => event.name === 'bench:operation-start' && event.cat.includes('blink.user_timing'),
  );
  if (!start) throw new Error('Operation User Timing marker missing');
  const main = events.filter((event) => event.pid === start.pid && event.tid === start.tid);
  const end = Math.max(...main.map((event) => event.ts + (event.dur ?? 0)));
  const output = { pid: start.pid, tid: start.tid, windowMs: (end - start.ts) / 1000 };
  for (const [name, key] of [
    ['Paint', 'paint'],
    ['PrePaint', 'prePaint'],
    ['Layout', 'layout'],
    ['UpdateLayoutTree', 'style'],
  ]) {
    const intervals = main
      .filter((event) => event.name === name && event.ph === 'X' && event.dur > 0)
      .map((event) => [Math.max(start.ts, event.ts), Math.min(end, event.ts + event.dur)]);
    output[key + 'Ms'] = durationUnion(intervals) / 1000;
    output[key + 'Events'] = intervals.filter(([a, b]) => b > a).length;
  }
  return output;
}
