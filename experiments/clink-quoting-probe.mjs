// Which quoted-name forms does link-cli accept, and how does it print
// them back?   node experiments/clink-quoting-probe.mjs [clink]
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { encodeLinksArchive } from '../js/src/storage/doublets-archive.js';

const bin = process.argv[2] ?? `${os.homedir()}/.cargo/bin/clink`;
const dir = mkdtempSync(path.join(os.tmpdir(), 'clink-quote-'));
const db = path.join(dir, 'q.links');
writeFileSync(
  path.join(dir, 'q.bin'),
  encodeLinksArchive({ links: [[1, 1]], names: new Map([['ms:prompt', 1]]) })
);
execFileSync(bin, ['--db', db, '--import-binary', path.join(dir, 'q.bin')]);
const server = spawn(bin, ['--db', db, '--serve', '127.0.0.1:0']);
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
  for (let i = 0; i < 200 && !/(^|\n)\.\n$/.test(buffer); i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  console.log(JSON.stringify(q), '=>', JSON.stringify(buffer));
};
const point = (ref) => `(() ((${ref}: ${ref} ${ref})))`;
await ask(`(() (("it's \\"q\\"": x x)))`);
await ask(point(`"it's"`));
await ask(point(`'say "hi"'`));
await ask(point('`both \'"`'));
await ask(point(`'it''s'`));
await ask(point(`"""both '" """`));
await ask(point(`'line1\nline2'`));
await ask(point(`'a:b'`));
await ask(point(`'(x)'`));
await ask(point(`'emoji 😀'`));
await ask(`((($x: $s $t)) (($x: $s $t)))`);
await ask(`((($x: 'ms:prompt' $t)) (($x: 'ms:prompt' $t)))`);
socket.end();
server.kill();
