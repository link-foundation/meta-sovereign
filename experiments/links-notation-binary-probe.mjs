// Round-trip probe: link object -> LiNo line (lino-objects-codec) -> binary
// links notation (links-notation BinaryLinoCodec) and back.
import { performance } from 'node:perf_hooks';
import { BinaryLinoCodec } from 'links-notation';
import { encodeLine, decodeLine } from 'lino-objects-codec';

const links = Array.from({ length: 200 }, (_, i) => ({
  id: `msg:vk:${i}`,
  tokens: ['msg', 'vk', `${i}`],
  children: [],
  source: 'vk',
  sender: i % 2 ? 'me' : '42',
  chat: '42',
  body: `Сообщение ${i}: "кавычки" и\nперевод строки`,
  timestamp: 1700000000 + i,
  replyTo: null,
}));
const lines = links.map((obj) => encodeLine({ obj }));
const text = `${lines.join('\n')}\n`;
const back = text
  .trim()
  .split('\n')
  .map((l) => decodeLine({ notation: l }));
console.log('text roundtrip', JSON.stringify(back) === JSON.stringify(links));
console.log(lines[1]);
const codec = new BinaryLinoCodec();
const t0 = performance.now();
const bytes = codec.encodeText(text);
const t1 = performance.now();
const decoded = codec.decodeText(bytes);
const t2 = performance.now();
console.log(
  'binary',
  bytes.length,
  'text',
  Buffer.byteLength(text),
  'enc ms',
  (t1 - t0).toFixed(1),
  'dec ms',
  (t2 - t1).toFixed(1)
);
console.log('binary->text equal', decoded === text);
if (decoded !== text) {
  console.log(JSON.stringify(decoded.slice(0, 300)));
}
