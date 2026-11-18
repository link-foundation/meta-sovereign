// Replay the exact parent's tiny shim with finite delayed request events.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const source = execFileSync(
  'git',
  ['show', '80e93aa5:js/tests/browser-store.test.js'],
  { encoding: 'utf8' }
);
const start = source.indexOf("test('browser store: indexedDB driver works");
const end = source.indexOf(
  "test('browser store: indexedDB driver attaches",
  start
);
assert.ok(start > 0 && end > start);
const original = source.slice(start, end);
const delayed = original
  .replaceAll('        });', '        }, 10);')
  .replace(
    '  await a.flush();',
    "  assert.equal((await driver.load())?.links[0]?.id, 'l:idb', 'a completed transaction must contain its nested write');\n  await a.flush();"
  );
assert.notEqual(original, delayed);
const temporary = new URL(
  `.idb-completion-${process.pid}.test.js`,
  import.meta.url
);
try {
  await writeFile(
    temporary,
    source
      .slice(0, start)
      .replaceAll("'./helpers/", "'../../js/tests/helpers/")
      .replaceAll("'../src/", "'../../js/src/") + delayed
  );
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-concurrency=1', fileURLToPath(temporary)],
    { cwd: fileURLToPath(root), encoding: 'utf8', env: process.env }
  );
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  assert.notEqual(result.status, 0, 'the old completion timer must fail');
  assert.match(
    result.stdout + result.stderr,
    /a completed transaction must contain its nested write/u
  );
} finally {
  await unlink(temporary);
}
