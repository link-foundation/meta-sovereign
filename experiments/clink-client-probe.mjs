// Probe link-cli answers through js/src/storage/clink.js:
//   node experiments/clink-client-probe.mjs [clink]
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  findClink,
  importArchive,
  clinkName,
  quoteName,
  startClinkServer,
} from '../js/src/storage/clink.js';
import { encodeLinksArchive } from '../js/src/storage/doublets-archive.js';

const bin = process.argv[2] ?? findClink();
const dir = mkdtempSync(path.join(os.tmpdir(), 'clink-probe-'));
const db = path.join(dir, 'r.links');
await importArchive({
  bin,
  db,
  archive: encodeLinksArchive({
    links: [[1, 1]],
    names: new Map([['ms:prompt', 1]]),
  }),
});
const server = await startClinkServer({ bin, db });
const show = async (q) => {
  try {
    console.log(q, '=>', JSON.stringify(await server.query(q)));
  } catch (error) {
    console.log(q, '=> ERROR', error.message);
  }
};
await show(`(() (('привет': 'привет' 'привет') ('a b': 'a b' 'a b')))`);
await show(`(() (('привет': 'привет' 'привет')))`);
await show(`(() (('ms:prompt' 'привет')))`);
await show(`(() (('ms:prompt' 'привет')))`);
await show(`((($q: 'ms:prompt' 'привет')) (($q: 'ms:prompt' 'привет')))`);
await show(`((($q: 'ms:prompt' 'нет')) (($q: 'ms:prompt' 'нет')))`);
await show(`(() (("bad \\"q\\"": x x)))`);
await show(`((($x: $s $t)) (($x: $s $t)))`);
await show(
  `(() ((${quoteName(clinkName('it\'s "q" `x`'))}: ${quoteName(clinkName('it\'s "q" `x`'))} ${quoteName(clinkName('it\'s "q" `x`'))})))`
);
await server.close();
