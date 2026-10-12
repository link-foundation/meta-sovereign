// Reply suggestions: in-memory index vs the link-cli reply store.
//   node experiments/reply-store-bench.mjs [pairs=500] [clink]
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createReplyIndex } from '../js/src/replies/reply-graph.js';
import { createClinkReplyStore } from '../js/src/replies/reply-store-clink.js';
import { findClink } from '../js/src/storage/clink.js';

const total = Number(process.argv[2] ?? 500);
const bin = process.argv[3] ?? findClink();
const index = createReplyIndex();
const prompts = Array.from(
  { length: Math.ceil(total / 5) },
  (_, i) => `вопрос ${i}`
);
for (let i = 0; i < total; i++) {
  index.learnPair({
    prompt: prompts[i % prompts.length],
    reply: `ответ ${i % 37} номер ${i % 11}`,
    at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
  });
}
const pairs = index.toLinks();
const dir = mkdtempSync(path.join(os.tmpdir(), 'reply-bench-'));
const store = createClinkReplyStore({ bin, db: path.join(dir, 'r.links') });
let t = performance.now();
await store.open(pairs);
console.log(
  `clink open (${pairs.length} edges): ${(performance.now() - t).toFixed(0)} ms`
);
const sample = prompts.slice(0, 500);
t = performance.now();
for (const p of sample) {
  index.suggestReplies(p);
}
console.log(
  `memory: ${((performance.now() - t) / sample.length).toFixed(3)} ms/suggest`
);
t = performance.now();
for (const p of sample) {
  await store.suggestReplies(p);
}
console.log(
  `clink:  ${((performance.now() - t) / sample.length).toFixed(3)} ms/suggest`
);
t = performance.now();
for (const p of sample.slice(0, 100)) {
  await store.learn({ prompt: p, reply: 'новый ответ', at: '2026-03-01' });
}
console.log(`clink:  ${((performance.now() - t) / 100).toFixed(3)} ms/learn`);
await store.close();
rmSync(dir, { recursive: true, force: true });
