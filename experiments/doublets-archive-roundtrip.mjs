// Round-trip + speed + link-cli compatibility for js/src/storage/doublets-archive.js
//   node experiments/doublets-archive-roundtrip.mjs [count] [clink]
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  decodeArchive,
  encodeArchive,
} from '../js/src/storage/doublets-archive.js';

const count = Number(process.argv[2] ?? 1000);
const clink = process.argv[3] ?? `${os.homedir()}/.cargo/bin/clink`;
const records = Array.from({ length: count }, (_, i) => ({
  id: `msg:vk:${i}`,
  tokens: ['msg', 'vk', `${i}`],
  children: [],
  source: 'vk',
  sender: i % 2 ? 'me' : '42',
  chat: '42',
  body: `Сообщение ${i} 😀: "q" и\nстрока`,
  timestamp: 1700000000 + i,
  replyTo: null,
  ok: i % 3 === 0,
  empty: '',
  nested: { a: [1, 'ms:x', { b: false }] },
}));
let t = performance.now();
const bytes = encodeArchive(records);
console.log(
  `encode ${count} records: ${(performance.now() - t).toFixed(1)}ms, ${bytes.length} bytes`
);
t = performance.now();
const back = decodeArchive(bytes);
console.log(
  `decode: ${(performance.now() - t).toFixed(1)}ms, equal=${JSON.stringify(back) === JSON.stringify(records)}`
);
const json = JSON.stringify(records);
console.log(`json size ${Buffer.byteLength(json)}`);
if (fs.existsSync(clink) && count <= 300) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbl-'));
  fs.writeFileSync(path.join(dir, 'data.bin'), bytes);
  execFileSync(clink, [
    '--db',
    path.join(dir, 'x.links'),
    '--import-binary',
    path.join(dir, 'data.bin'),
    '--export-binary',
    path.join(dir, 'x.bin'),
  ]);
  const again = decodeArchive(fs.readFileSync(path.join(dir, 'x.bin')));
  console.log(
    `clink (${clink}) re-export equal=${JSON.stringify(again) === JSON.stringify(records)}`
  );
}
