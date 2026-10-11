// Stage timings for the doublets archive (network build vs packet bytes).
import { performance } from 'node:perf_hooks';
import {
  encodeNetwork,
  encodeArchive,
  decodeArchive,
  readNetwork,
} from '../js/src/storage/doublets-archive.js';
const count = Number(process.argv[2] ?? 10000);
const records = Array.from({ length: count }, (_, i) => ({
  id: `msg:vk:${i}`,
  tokens: ['msg', 'vk', `${i}`],
  children: [],
  source: 'vk',
  sender: i % 2 ? 'me' : '42',
  chat: String(i % 50),
  body: `Сообщение номер ${i}, как дела?`,
  timestamp: new Date(1700000000000 + i * 1000).toISOString(),
  replyTo: null,
}));
for (let round = 0; round < 3; round++) {
  const t = performance.now();
  const net = encodeNetwork(records);
  const t1 = performance.now();
  const bytes = encodeArchive(records);
  const t2 = performance.now();
  readNetwork(bytes);
  const t3 = performance.now();
  decodeArchive(bytes);
  const t4 = performance.now();
  console.log(
    `round ${round}: network ${(t1 - t).toFixed(0)}ms (${net.links.length} links), archive ${(t2 - t1).toFixed(0)}ms (${bytes.length} B, json ${JSON.stringify(records).length}), readNetwork ${(t3 - t2).toFixed(0)}ms, decode ${(t4 - t3).toFixed(0)}ms`
  );
}
