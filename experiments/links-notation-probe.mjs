// Probe of links-notation / lino-objects-codec for the store format.
import * as ln from 'links-notation';
import * as codec from 'lino-objects-codec';

const link = {
  id: 'msg:vk:1',
  tokens: ['msg', 'vk', 'hello world'],
  children: ['msg:vk:2'],
  body: 'Привет: "как" дела?\nвторая строка',
  timestamp: 1700000000,
  replyTo: null,
  chatType: 'personal',
};
console.log(
  'escape:',
  ln.escapeReference('msg:vk:1'),
  ln.escapeReference('a b'),
  ln.escapeReference('x"y\'z')
);
console.log('codec keys:', Object.keys(codec).join(' '));
const enc = codec.encode({ obj: link });
console.log(`--- encode\n${enc}`);
console.log('--- decode', JSON.stringify(codec.decode({ notation: enc })));
const line = codec.encodeLine?.({ obj: link });
console.log(`--- encodeLine\n${line}`);
const ind = codec.formatIndented?.({ id: link.id, obj: link });
console.log(`--- formatIndented\n${ind}`);
console.log(
  '--- parseIndented',
  JSON.stringify(codec.parseIndented?.({ text: ind }))
);
const doc = new ln.Parser().parse(
  `(${ln.escapeReference('msg:vk:1')}: msg vk 'hello world')\n(a: b c)`
);
console.log('--- parsed', JSON.stringify(doc));
const bin = new ln.BinaryLinoCodec();
const bytes = bin.encodeText(enc);
console.log('binary bytes', bytes.length, 'text bytes', Buffer.byteLength(enc));
console.log('roundtrip ok', bin.decodeText(bytes) === enc);
