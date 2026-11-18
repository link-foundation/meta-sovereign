import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const fixture = fileURLToPath(
  new URL(
    '../../experiments/issue-56/vk-scheduler-lifetime.mjs',
    import.meta.url
  )
);
const runtime = process.versions.deno
  ? ['run', '--allow-all', '--no-check']
  : process.versions.bun
    ? []
    : ['--max-old-space-size=128'];

for (const kind of ['online', 'friends', 'wall']) {
  test(
    `the ${kind} scheduler owns process lifetime until explicit stop`,
    { timeout: 12000 },
    async () => {
      const result = await execute(
        process.execPath,
        [...runtime, fixture, kind],
        {
          timeout: 8000,
          maxBuffer: 16384,
        }
      );
      assert.equal(result.stderr, '');
      assert.notEqual(
        result.stdout.trim(),
        '',
        'The process exited before its scheduled triggers could run'
      );
      assert.deepEqual(JSON.parse(result.stdout), {
        kind,
        ticks: 3,
        effects: 0,
        timers: 1,
        closed: true,
      });
    }
  );
}
