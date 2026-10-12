// Probe link-cli's `--serve` text protocol from Node: start the server on
// port 0, read the bound address, send LiNo queries, read replies.
//   node experiments/clink-serve-probe.mjs <db.links> [clink]
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import { escapeReference } from 'links-notation';

const db = process.argv[2];
const bin = process.argv[3] ?? `${os.homedir()}/.cargo/bin/clink`;
const server = spawn(bin, ['--db', db, '--serve', '127.0.0.1:0']);
const address = await new Promise((resolve) => {
  server.stdout.on('data', (d) => {
    const m = String(d).match(/listening on ([\d.]+):(\d+)/);
    if (m) {
      resolve({ host: m[1], port: Number(m[2]) });
    }
  });
});
console.log('address', address);
const socket = net.connect(address);
socket.setEncoding('utf8');
let buffer = '';
socket.on('data', (d) => {
  buffer += d;
});
const ask = async (q) => {
  buffer = '';
  const t = performance.now();
  socket.write(`${q}\n.\n`);
  for (let i = 0; i < 200 && !/\n\.\n$|^\.\n$/.test(buffer); i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  console.log(
    `--- ${q} (${(performance.now() - t).toFixed(1)}ms)\n${JSON.stringify(buffer)}`
  );
};
const P = escapeReference('привет');
await ask(`((($e: ${P} $r) ($c: $e $n)) (($e: ${P} $r) ($c: $e $n)))`);
await ask(
  `((($e: ${escapeReference('нет такого')} $r)) (($e: ${escapeReference('нет такого')} $r)))`
);
await ask(
  `((($e: ${escapeReference('it\'s "q"')} $r)) (($e: ${escapeReference('it\'s "q"')} $r)))`
);
socket.end();
server.kill();
