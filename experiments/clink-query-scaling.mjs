// Does a reply lookup in link-cli get slower as the graph grows?
//   CLINK_BIN=... node experiments/clink-query-scaling.mjs [sizes...]
//
// Loads `n` reply pairs (n/5 prompts × 5 replies each) and times the
// three shapes of the reply join over a raw `--serve` connection.
// Measured on 2026-10-11 (ms per query; the first query includes warm-up):
//
//   link-cli Rust 1.0.0   100 pairs: 372 / 425 / 503
//                         200 pairs: 1345 / 1394 / 1439
//   link-cli .NET 4.0.0   100 pairs: 393 / 22 / 44
//                        1000 pairs: 454 / 92 / 89
//                        5000 pairs: 722 / 246 / 197
//
// Both builds scan every link on each lookup (Rust: `LinkStorage::search`
// and `query` iterate `self.links.values()`), so the in-memory reply
// index stays the per-keystroke path and clink is the persisted mirror.
import { mkdtempSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { createClinkReplyStore } from '../js/src/replies/reply-store-clink.js';
import {
  findClink,
  parseClinkReply,
  startClinkServer,
} from '../js/src/storage/clink.js';

const bin = findClink();
const sizes = process.argv.slice(2).map(Number);
const join = (parts) => `((${parts}) (${parts}))`;
const queries = [
  join("($q: 'ms:prompt' 'вопрос 1')"),
  join("($q: 'ms:prompt' 'вопрос 1') ($e: $q $r)"),
  join("($q: 'ms:prompt' 'вопрос 1') ($e: $q $r) ($a: $e $v)"),
];

for (const n of sizes.length ? sizes : [100, 200]) {
  const pairs = Array.from({ length: n }, (_, i) => ({
    prompt: `вопрос ${Math.floor(i / 5)}`,
    reply: `ответ ${i}`,
    count: 1 + (i % 7),
    at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
  }));
  const dir = mkdtempSync(path.join(os.tmpdir(), 'clink-q-'));
  const db = path.join(dir, 'r.links');
  const store = createClinkReplyStore({ bin, db });
  await store.open(pairs);
  await store.close();
  const server = await startClinkServer({ bin, db, timeoutMs: 120_000 });
  const raw = (text) =>
    new Promise((resolve) => {
      const socket = net.connect(server.address);
      let reply = '';
      socket.on('data', (chunk) => {
        reply += chunk;
        if (reply === '.\n' || reply.endsWith('\n.\n')) {
          socket.end();
          resolve(reply);
        }
      });
      socket.write(`${text}\n.\n`);
    });
  const times = [];
  for (const text of queries) {
    const t = performance.now();
    parseClinkReply(await raw(text));
    times.push((performance.now() - t).toFixed(0));
  }
  console.log(`${n} pairs: ${times.join(' / ')} ms`);
  await server.close();
  rmSync(dir, { recursive: true, force: true });
}
