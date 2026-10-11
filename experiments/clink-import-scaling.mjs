// How long does `clink --import-binary` take as the reply graph grows?
//   node experiments/clink-import-scaling.mjs [clink] [sizes...]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { encodeLinksArchive } from '../js/src/storage/doublets-archive.js';
import { replyNetwork } from '../js/src/replies/reply-store-clink.js';
import { findClink } from '../js/src/storage/clink.js';

const bin = process.argv[2] ?? findClink();
const sizes = process.argv.slice(3).map(Number);
for (const n of sizes.length ? sizes : [500, 1000, 2000, 4000]) {
  const pairs = Array.from({ length: n }, (_, i) => ({
    prompt: `вопрос ${Math.floor(i / 5)}`,
    reply: `ответ ${i}`,
    count: 1 + (i % 7),
    at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
  }));
  const network = replyNetwork(pairs);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'clink-scale-'));
  writeFileSync(path.join(dir, 'a.bin'), encodeLinksArchive(network));
  const t = performance.now();
  execFileSync(bin, [
    '--db',
    path.join(dir, 'a.links'),
    '--import-binary',
    path.join(dir, 'a.bin'),
  ]);
  console.log(
    `${n} pairs: ${network.links.length} links, ${network.names.size} names -> ${(performance.now() - t).toFixed(0)} ms`
  );
  rmSync(dir, { recursive: true, force: true });
}
