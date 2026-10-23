// Migrations and stores for the schema tests (R-Z17).

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { formatLinoRecords } from '../../src/storage/lino-store.js';

export const tmpdir = () => fs.mkdtemp(path.join(os.tmpdir(), 'ms-migrate-'));

export const oldLinks = (count = 40) =>
  Array.from({ length: count }, (_, n) => ({
    id: `msg:test:${n}`,
    tokens: ['message', 'test', String(n)],
    children: [],
    body: `message ${n}`,
  }));

/** A store folder whose log holds `links` and has no schema link: version 0. */
export const writeOldStore = async (dir, links = oldLinks()) => {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'data.lino'), formatLinoRecords(links));
  return dir;
};

const upgraded = (link) => ({ ...link, body: `${link.body} (v1)`, shape: 1 });

/** The step the tests migrate with: every message gets `shape: 1`. */
export const goodMigration = {
  id: '0001-test-shape',
  from: 0,
  to: 1,
  description: 'test migration: every message gets shape 1',
  async up(ctx) {
    await ctx.scan({ prefix: 'msg:test:', batchSize: 7 }, async (batch) => {
      await ctx.putMany(batch.map((l) => (l.shape === 1 ? l : upgraded(l))));
    });
  },
};

/** The same step, which stops after `after` batches: throws, or exits the process. */
export const stoppingMigration = (after, how = 'throw') => ({
  ...goodMigration,
  async up(ctx) {
    let batches = 0;
    await ctx.scan({ prefix: 'msg:test:', batchSize: 7 }, async (batch) => {
      await ctx.putMany(batch.map(upgraded));
      batches += 1;
      if (batches === after) {
        if (how === 'exit') {
          process.exit(9); // dies without any cleanup
        }
        throw new Error('stopped half way');
      }
    });
  },
});

/** A second step (to 2), for chains. */
export const secondMigration = {
  id: '0002-test-second',
  from: 1,
  to: 2,
  description: 'test migration: every message gets shape 2',
  async up(ctx) {
    await ctx.scan({ prefix: 'msg:test:' }, async (batch) => {
      await ctx.putMany(batch.map((l) => ({ ...l, shape: 2 })));
    });
  },
};

/** The links of a store, without the schema link, sorted. */
export const dataOf = async (store) =>
  (await store.query())
    .filter((l) => l.id !== 'meta:schema')
    .sort((a, b) => a.id.localeCompare(b.id));
