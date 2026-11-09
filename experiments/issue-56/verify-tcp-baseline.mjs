// Run only the bounded default-wire regression against the pre-migration TCP adapter.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = await mkdtemp(path.join(os.tmpdir(), 'ms-tcp-baseline-'));
try {
  const baseline = path.join(directory, 'tcp.mjs');
  await writeFile(
    baseline,
    execFileSync('git', [
      'show',
      'ae8cdd3d8b5ad94ed5d23a3c7457d4fc95d91cb0:js/src/sync/tcp-transport.js',
    ])
  );
  const result = spawnSync(
    process.execPath,
    [
      '--test',
      '--test-concurrency=1',
      '--test-name-pattern=TCP defaults',
      'js/tests/lino-sync-tcp.test.js',
    ],
    {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=192',
        TCP_SYNC_TRANSPORT_MODULE: pathToFileURL(baseline).href,
      },
    }
  );
  process.stdout.write(result.stdout + result.stderr);
  assert.equal(
    result.status,
    1,
    'the original adapter must fail the wire regression'
  );
  assert.match(result.stdout, /meta-sovereign-sync\.lino\.v2/);
  assert.match(result.stdout, /changed after send/);
  assert.doesNotMatch(result.stdout, /cancelledByParent|testTimeoutFailure/);
  console.log(
    'Confirmed: the old adapter emits JSON and retains a mutable queued event.'
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
