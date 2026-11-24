import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test(
  'native authorization entry releases ESM evaluation before awaiting Electron ready',
  {
    timeout: 10000,
    skip: Boolean(process.versions.bun || process.versions.deno),
  },
  () => {
    const probe = fileURLToPath(
      new URL(
        '../../experiments/issue-56/vk-token-electron-entry.mjs',
        import.meta.url
      )
    );
    for (const args of [[], ['--stall']]) {
      const output = execFileSync(process.execPath, [probe, ...args], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const result = JSON.parse(output.trim().split('\n').at(-1));
      assert.deepEqual(result, {
        evaluated: true,
        readyRequested: true,
        outcome: 1,
      });
    }
  }
);
