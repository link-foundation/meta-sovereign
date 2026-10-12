// Build a tiny prompt → reply network, import it into link-cli and
// look at what a join query over `--serve` returns.
//   node experiments/clink-reply-network.mjs [clink]
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { escapeReference } from 'links-notation';
import {
  encodeLinksArchive,
  scalarName,
} from '../js/src/storage/doublets-archive.js';

const bin = process.argv[2] ?? `${os.homedir()}/.cargo/bin/clink`;
const links = [];
const names = new Map();
const point = (name) => {
  if (!names.has(name)) {
    links.push([links.length + 1, links.length + 1]);
    names.set(name, links.length);
  }
  return names.get(name);
};
const pair = (s, t) => {
  links.push([s, t]);
  return links.length;
};
// The prompt is wrapped in a (ms:prompt P) node so a reply equal to its
// prompt ("привет" → "Привет!") is still a distinct edge, not the point.
const prompts = new Map();
const promptNode = (prompt) => {
  if (!prompts.has(prompt)) {
    prompts.set(prompt, pair(point('ms:prompt'), point(scalarName(prompt))));
  }
  return prompts.get(prompt);
};
const edge = (prompt, reply, original, count) => {
  const e = pair(promptNode(prompt), point(scalarName(reply)));
  pair(e, point(scalarName(count)));
  pair(e, point(scalarName(original)));
};
edge('привет', 'привет как дела', 'Привет! Как дела?', 3);
edge('привет', 'здравствуйте', 'Здравствуйте', 1);
edge('как дела', 'хорошо', 'Хорошо)', 2);
edge('привет', 'привет', 'Привет!', 5);
const dir = mkdtempSync(path.join(os.tmpdir(), 'clink-reply-'));
writeFileSync(path.join(dir, 'r.bin'), encodeLinksArchive({ links, names }));
execFileSync(bin, [
  '--db',
  path.join(dir, 'r.links'),
  '--import-binary',
  path.join(dir, 'r.bin'),
]);
const server = spawn(bin, [
  '--db',
  path.join(dir, 'r.links'),
  '--auto-create-missing-references',
  '--serve',
  '127.0.0.1:0',
]);
const address = await new Promise((resolve) => {
  server.stdout.on('data', (d) => {
    const m = String(d).match(/listening on ([\d.]+):(\d+)/);
    if (m) {
      resolve({ host: m[1], port: Number(m[2]) });
    }
  });
});
const socket = net.connect(address);
socket.setEncoding('utf8');
let buffer = '';
socket.on('data', (d) => {
  buffer += d;
});
const ask = async (q) => {
  buffer = '';
  socket.write(`${q}\n.\n`);
  for (let i = 0; i < 400 && !/(^|\n)\.\n$/.test(buffer); i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  console.log(`--- ${q}\n${buffer}`);
};
const P = escapeReference('привет');
const Q = `($q: 'ms:prompt' ${P})`;
await ask(`((${Q} ($e: $q $r) ($a: $e $v)) (${Q} ($e: $q $r) ($a: $e $v)))`);
await ask(`(() ((${P} ${escapeReference('новый ответ')})))`);
await ask(`(() ((40 41) (40 42)))`);
await ask(`((($q: 'ms:prompt' нет)) (($q: 'ms:prompt' нет)))`);
socket.end();
server.kill();
