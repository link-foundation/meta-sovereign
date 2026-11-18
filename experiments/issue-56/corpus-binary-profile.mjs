import { performance } from 'node:perf_hooks';
import { BinaryLinoCodec, Parser } from 'links-notation';

// The imported existing regression retains its 101-row input and 10s deadline.
// Capture only fixed phase names, counts and elapsed time, never private values.
const totals = new Map();
for (const [prototype, method, phase] of [
  [BinaryLinoCodec.prototype, 'encode', 'binary.encode'],
  [BinaryLinoCodec.prototype, 'decode', 'binary.decode'],
  [Parser.prototype, 'parse', 'notation.parse'],
]) {
  const original = prototype[method];
  prototype[method] = function (...args) {
    const started = performance.now();
    try {
      return original.apply(this, args);
    } finally {
      const total = totals.get(phase) ?? { calls: 0, elapsedMs: 0 };
      total.calls += 1;
      total.elapsedMs += performance.now() - started;
      totals.set(phase, total);
    }
  };
}
process.on('beforeExit', () => {
  console.log(JSON.stringify(Object.fromEntries(totals)));
});
await import('../../js/tests/vacancy-corpus.test.js');
