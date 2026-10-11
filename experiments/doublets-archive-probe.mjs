// Probe: encode store records as a deduplicated doublets network written in
// the link-cli store-archive layout (links packet + names packet), import it
// with `clink --import-binary`, and decode it back in JS.
//   node experiments/doublets-archive-probe.mjs [count] [clink-binary]
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  DecodeLimits,
  External,
  LinksPacket,
  PacketReader,
} from 'links-notation';

const count = Number(process.argv[2] ?? 200);
const clink = process.argv[3] ?? `${os.homedir()}/.cargo/bin/clink`;

const records = Array.from({ length: count }, (_, i) => ({
  id: `msg:vk:${i}`,
  tokens: ['msg', 'vk', `${i}`],
  children: [],
  source: 'vk',
  sender: i % 2 ? 'me' : '42',
  chat: '42',
  body: `Сообщение ${i}: "кавычки" и\nперевод строки (скобки)`,
  timestamp: 1700000000 + i,
  replyTo: null,
  flag: i % 3 === 0,
  empty: '',
}));

const TYPES = [
  'ms:records',
  'ms:nil',
  'ms:array',
  'ms:object',
  'ms:number',
  'ms:string',
  'ms:null',
  'ms:true',
  'ms:false',
  'ms:empty',
];

const encodeNetwork = (items) => {
  const links = []; // index+1 = address; [s, t]
  const pairs = new Map();
  const names = new Map(); // name -> address
  const nameOf = [];
  const point = (name) => {
    let a = names.get(name);
    if (a === undefined) {
      a = links.length + 1;
      links.push([a, a]);
      names.set(name, a);
      nameOf.push([a, name]);
    }
    return a;
  };
  const pair = (s, t) => {
    const key = `${s},${t}`;
    let a = pairs.get(key);
    if (a === undefined) {
      links.push([s, t]);
      a = links.length;
      pairs.set(key, a);
    }
    return a;
  };
  TYPES.forEach(point);
  const T = Object.fromEntries(TYPES.map((n) => [n, names.get(n)]));
  const list = (nodes) =>
    nodes.reduceRight((rest, n) => pair(n, rest), T['ms:nil']);
  const node = (v) => {
    if (v === null || v === undefined) {
      return T['ms:null'];
    }
    if (v === true) {
      return T['ms:true'];
    }
    if (v === false) {
      return T['ms:false'];
    }
    if (typeof v === 'number') {
      return pair(T['ms:number'], point(`n:${v}`));
    }
    if (typeof v === 'string') {
      if (v === '') {
        return T['ms:empty'];
      }
      return /^(ms:|n:)|^\d+$/.test(v)
        ? pair(T['ms:string'], point(v))
        : point(v);
    }
    if (Array.isArray(v)) {
      return pair(T['ms:array'], list(v.map(node)));
    }
    return pair(
      T['ms:object'],
      list(
        Object.entries(v)
          .filter(([, x]) => x !== undefined)
          .map(([k, x]) =>
            pair(point(k.match(/^(ms:|n:)|^\d+$/) ? `ms:key:${k}` : k), node(x))
          )
      )
    );
  };
  for (const r of items) {
    pair(T['ms:records'], node(r));
  }
  return { links, nameOf };
};

const toArchive = ({ links, nameOf }) => {
  const a = LinksPacket.pack(
    false,
    links.map((l, i) => [i + 1, l]),
    true
  );
  const n = LinksPacket.pack(
    true,
    nameOf.map(([addr, name], i) => [
      i + 1,
      [
        new External(addr),
        ...Array.from(name, (c) => new External(c.codePointAt(0))),
      ],
    ]),
    false
  );
  const ab = a.toBytes(DecodeLimits.unlimited());
  const nb = n.toBytes(DecodeLimits.unlimited());
  return Buffer.concat([ab, nb]);
};

const t0 = performance.now();
const net = encodeNetwork(records);
const t1 = performance.now();
const bytes = toArchive(net);
const t2 = performance.now();
console.log(
  `records=${count} links=${net.links.length} names=${net.nameOf.length} bytes=${bytes.length} network=${(t1 - t0).toFixed(1)}ms pack=${(t2 - t1).toFixed(1)}ms`
);

// Decode back in JS.
const fromArchive = (buf) => {
  const r = new PacketReader(buf);
  const lp = r.read(DecodeLimits.unlimited());
  const np = r.read(DecodeLimits.unlimited());
  const links = new Map(
    lp.links().map(([a, refs]) => [Number(a), refs.map(Number)])
  );
  const names = new Map();
  for (const [, refs] of np?.links() ?? []) {
    const [addr, ...cps] = refs.map((x) => Number(x.value));
    names.set(addr, String.fromCodePoint(...cps));
  }
  const byName = new Map([...names].map(([a, n]) => [n, a]));
  const T = Object.fromEntries(TYPES.map((n) => [n, byName.get(n)]));
  const listOf = (a) => {
    const out = [];
    while (a !== T['ms:nil']) {
      const [h, t] = links.get(a);
      out.push(h);
      a = t;
    }
    return out;
  };
  const value = (a) => {
    if (a === T['ms:null']) {
      return null;
    }
    if (a === T['ms:true']) {
      return true;
    }
    if (a === T['ms:false']) {
      return false;
    }
    if (a === T['ms:empty']) {
      return '';
    }
    const [s, t] = links.get(a);
    if (s === a && t === a) {
      return names.get(a);
    }
    if (s === T['ms:number']) {
      return Number(names.get(t).slice(2));
    }
    if (s === T['ms:string']) {
      return names.get(t);
    }
    if (s === T['ms:array']) {
      return listOf(t).map(value);
    }
    if (s === T['ms:object']) {
      return Object.fromEntries(
        listOf(t).map((e) => {
          const [k, v] = links.get(e);
          const key = names.get(k);
          return [key.startsWith('ms:key:') ? key.slice(7) : key, value(v)];
        })
      );
    }
    throw new Error(`bad node ${a}`);
  };
  const out = [];
  for (const [a, [s, t]] of links) {
    if (s === T['ms:records'] && a !== s) {
      out.push(value(t));
    }
  }
  return out;
};
const t3 = performance.now();
const back = fromArchive(bytes);
const t4 = performance.now();
console.log(
  'js roundtrip',
  JSON.stringify(back) === JSON.stringify(records),
  `decode=${(t4 - t3).toFixed(1)}ms`
);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doublets-probe-'));
fs.writeFileSync(path.join(dir, 'data.bin'), bytes);
if (count <= 1000 && fs.existsSync(clink)) {
  const t5 = performance.now();
  execFileSync(clink, [
    '--db',
    path.join(dir, 'x.links'),
    '--import-binary',
    path.join(dir, 'data.bin'),
    '--export',
    path.join(dir, 'x.lino'),
    '--export-binary',
    path.join(dir, 'x.bin'),
  ]);
  console.log(`clink import/export ${(performance.now() - t5).toFixed(0)}ms`);
  console.log(
    fs
      .readFileSync(path.join(dir, 'x.lino'), 'utf8')
      .split('\n')
      .slice(0, 25)
      .join('\n')
  );
  const again = fromArchive(fs.readFileSync(path.join(dir, 'x.bin')));
  console.log(
    'clink re-export roundtrip',
    JSON.stringify(again) === JSON.stringify(records)
  );
}
console.log(dir);
