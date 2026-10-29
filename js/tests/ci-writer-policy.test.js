import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';

const directory = new URL('../../.github/workflows/', import.meta.url);

test('all publishing workflows share a non-cancellable writer queue', () => {
  let writers = 0;
  for (const file of readdirSync(directory)) {
    if (!file.endsWith('.yml')) {
      continue;
    }
    const flow = parse(readFileSync(new URL(file, directory), 'utf8'));
    for (const [name, job] of Object.entries(flow.jobs)) {
      if (
        job.permissions?.contents !== 'write' &&
        job.permissions?.pages !== 'write'
      ) {
        continue;
      }
      writers++;
      assert.equal(
        flow.concurrency,
        undefined,
        `${file}: workflow cancellation can interrupt a writer`
      );
      assert.equal(
        job.concurrency?.group,
        'main-writer-${{ github.repository }}-main',
        `${file}/${name}`
      );
      assert.equal(
        job.concurrency?.['cancel-in-progress'],
        false,
        `${file}/${name}`
      );
    }
  }
  assert.equal(
    writers,
    5,
    'release, instant release, changeset PR, Pages and desktop'
  );
});

test('read-only jobs cancel only their own superseded matrix lane', () => {
  for (const file of readdirSync(directory)) {
    if (!file.endsWith('.yml')) {
      continue;
    }
    const flow = parse(readFileSync(new URL(file, directory), 'utf8'));
    for (const [name, job] of Object.entries(flow.jobs)) {
      if (
        job.permissions?.contents === 'write' ||
        job.permissions?.pages === 'write'
      ) {
        continue;
      }
      const group = job.concurrency?.group;
      assert.ok(
        group?.includes(`-${name}-`),
        `${file}/${name}: distinct job queue`
      );
      assert.ok(
        group.includes('${{ github.ref }}'),
        `${file}/${name}: distinct ref queue`
      );
      if (job.strategy?.matrix) {
        assert.ok(
          group.includes('strategy.job-index'),
          `${file}/${name}: distinct matrix queue`
        );
      }
      assert.equal(
        job.concurrency['cancel-in-progress'],
        true,
        `${file}/${name}`
      );
    }
  }
});
