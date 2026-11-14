import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runCli } from '../src/cli/index.js';
import { HELP } from '../src/cli/help.js';
import { ordinaryCommandNames } from '../src/cli/command-names.js';

test(
  'help and unknown commands load no ordinary or provider graph',
  {
    timeout: 10000,
    skip: Boolean(process.versions.bun || process.versions.deno),
  },
  () => {
    const probe = fileURLToPath(
      new URL(
        '../../experiments/issue-56/cli-help-imports.mjs',
        import.meta.url
      )
    );
    const result = JSON.parse(
      execFileSync(process.execPath, [probe], {
        encoding: 'utf8',
        timeout: 5000,
      })
    );
    assert.deepEqual(result.codes, [0, 0, 0, 0, 1]);
    assert.equal(new Set(result.outputHashes).size, 1);
    assert(result.hasUsage && result.hasAssignment);
    assert.deepEqual(
      result.modules.filter(
        (name) =>
          name.startsWith('sources/') ||
          name.startsWith('jobs/') ||
          name.startsWith('assignments/') ||
          name === 'server/index.js' ||
          name === 'cli/commands.js'
      ),
      [],
      'Help imported the ordinary/provider graph.'
    );
  }
);

test(
  'lightweight admission retains every ordinary registered command',
  { timeout: 10000 },
  async () => {
    const { cliCommandNames } = await import('../src/cli/commands.js');
    assert.deepEqual([...ordinaryCommandNames].sort(), cliCommandNames.sort());
  }
);

test(
  'usage, aliases and unknown-command status preserve existing behavior',
  { timeout: 5000 },
  async () => {
    for (const argv of [[], ['help'], ['--help'], ['-h']]) {
      const output = [];
      assert.equal(await runCli(argv, { log: (text) => output.push(text) }), 0);
      assert.deepEqual(output, [HELP]);
    }
    for (const command of [
      'unknown-fixture-command',
      'constructor',
      '__proto__',
      'toString',
    ]) {
      const output = [];
      // A rejected unknown command must not attempt to parse an invalid flag.
      assert.equal(
        await runCli([command, '--bad=['], {
          log: (text) => output.push(text),
        }),
        1
      );
      assert.deepEqual(output, [HELP]);
    }
  }
);
