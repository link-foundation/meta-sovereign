// Reproduce Windows' global Git line-ending policy in an owned hook fixture.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const dir = await mkdtemp(join(tmpdir(), 'issue43-git-policy-'));
try {
  const config = join(dir, 'global.gitconfig');
  await writeFile(config, '[core]\n\tautocrlf = true\n');
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-concurrency=1', 'js/tests/ci-precommit.test.js'],
    {
      cwd,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: config,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_COUNT: '0',
      },
    }
  );
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  assert.equal(result.status, 0, result.error?.message);
  assert.doesNotMatch(
    `${result.stdout}\n${result.stderr}`,
    /LF will be replaced by CRLF/
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
