// The guard for the migration registry (R-Z17): ids unique, numbers contiguous
// from 1, every module in the folder listed, CURRENT_SCHEMA the last `to`.
// A merge that adds a migration and forgets to list it or to raise
// CURRENT_SCHEMA fails here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';

import { CURRENT_SCHEMA, MIGRATIONS } from '../src/storage/migrations/index.js';

const DIR = new URL('../src/storage/migrations/', import.meta.url);

test('migration ids are unique and numbered 0001.. without gaps', () => {
  const ids = MIGRATIONS.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  MIGRATIONS.forEach((m, index) => {
    const number = String(index + 1).padStart(4, '0');
    assert.match(m.id, new RegExp(`^${number}-[a-z0-9-]+$`), m.id);
    assert.equal(m.from, index, `${m.id} starts at ${index}`);
    assert.equal(m.to, index + 1, `${m.id} ends at ${index + 1}`);
    assert.equal(typeof m.up, 'function', `${m.id} has up()`);
    assert.ok(m.description?.length > 10, `${m.id} is described`);
  });
});

test('CURRENT_SCHEMA is the last migration`s `to`', () => {
  assert.equal(CURRENT_SCHEMA, MIGRATIONS.at(-1)?.to ?? 0);
});

test('every migration module in the folder is registered', async () => {
  const files = (await fs.readdir(DIR)).filter((f) => /^\d{4}-.+\.js$/.test(f));
  assert.deepEqual(
    files.map((f) => f.replace(/\.js$/, '')).sort(),
    MIGRATIONS.map((m) => m.id).sort()
  );
});

test('migration modules are browser-safe: no node: imports', async () => {
  const names = (await fs.readdir(DIR)).filter(
    (f) =>
      /^\d{4}-.+\.js$/.test(f) ||
      f === 'core.js' ||
      f === 'index.js' ||
      f === 'browser-runner.js'
  );
  for (const name of names) {
    const text = await fs.readFile(new URL(name, DIR), 'utf8');
    assert.doesNotMatch(text, /from\s+['"]node:/, `${name} imports node:*`);
    assert.doesNotMatch(
      text,
      /\bfetch\s*\(/,
      `${name} must not use the network`
    );
  }
});
