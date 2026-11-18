// Reproduce the default-JSON sync failure in a temporary module graph.
// The working source files and application servers are never changed.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
const temporary = await mkdtemp(path.join(tmpdir(), 'ms-sync-baseline-'));
const reference = '7e822142155e17f986f5285f293c2a13b2cb5f8f';
try {
  for (const file of ['ws-transport.js', 'ws-frame.js']) {
    let source = execFileSync(
      'git',
      ['show', `${reference}:js/src/sync/${file}`],
      { cwd: root, encoding: 'utf8' }
    );
    source = source.replace(
      "'./bun-server.js'",
      JSON.stringify(
        pathToFileURL(path.join(root, 'js/src/sync/bun-server.js')).href
      )
    );
    await writeFile(path.join(temporary, file), source);
  }
  let source = await readFile(
    path.join(root, 'js/tests/lino-sync-ws.test.js'),
    'utf8'
  );
  source = source.replace(
    "'../src/sync/ws-transport.js'",
    "'./ws-transport.js'"
  );
  source = source.replace(
    "'../src/transport/lino.js'",
    JSON.stringify(
      pathToFileURL(path.join(root, 'js/src/transport/lino.js')).href
    )
  );
  await writeFile(path.join(temporary, 'baseline.test.mjs'), source);
  const result = spawnSync(
    process.execPath,
    [
      '--max-old-space-size=192',
      '--test',
      '--test-concurrency=1',
      '--test-timeout=5000',
      '--test-name-pattern=unnegotiated sync',
      path.join(temporary, 'baseline.test.mjs'),
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 }
  );
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  assert.equal(
    result.status,
    1,
    'the old JSON default must fail the regression'
  );
  assert.match(
    result.stdout + result.stderr,
    /ParseError|deep-equal|deeply equal/
  );
  console.log('Expected baseline failure reproduced.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
