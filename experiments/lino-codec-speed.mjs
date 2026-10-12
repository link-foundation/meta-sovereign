// Speed + LiNo validity of one-record-per-line text via lino-objects-codec.
import { performance } from 'node:perf_hooks';
import { encodeLine, decodeLine } from 'lino-objects-codec';
import { Parser } from 'links-notation';
const n = Number(process.argv[2] ?? 10000);
const records = Array.from({ length: n }, (_, i) => ({
  id: `msg:vk:${i}`,
  tokens: ['msg', 'vk', `${i}`],
  children: [],
  source: 'vk',
  sender: 'me',
  chat: String(i % 50),
  body: `Сообщение ${i}, "как" дела?\nok (x)`,
  timestamp: new Date(1.7e12 + i).toISOString(),
  replyTo: null,
  n: i,
  ok: true,
  nested: { a: [1, 'b'] },
}));
let t = performance.now();
const lines = records.map((obj) => encodeLine({ obj }));
console.log('encode', (performance.now() - t).toFixed(0), 'ms');
t = performance.now();
const back = lines.map((notation) => decodeLine({ notation }));
console.log(
  'decode',
  (performance.now() - t).toFixed(0),
  'ms',
  JSON.stringify(back) === JSON.stringify(records)
);
const parsed = new Parser().parse(lines.slice(0, 3).join('\n'));
console.log('links-notation Parser accepts lines:', parsed.length);
console.log(lines[0]);
