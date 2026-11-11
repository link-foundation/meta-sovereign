import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test(
  'serve admission leaves provider and ordinary command modules to their consumers',
  {
    timeout: 10000,
    // The load hook observes Node's actual module graph; other runtimes run
    // the shared CLI and real rolling-host behavioral checks instead.
    skip: Boolean(process.versions.bun || process.versions.deno),
  },
  () => {
    const probe = fileURLToPath(
      new URL(
        '../../experiments/issue-56/cli-serve-imports.mjs',
        import.meta.url
      )
    );
    const result = JSON.parse(
      execFileSync(process.execPath, [probe], {
        encoding: 'utf8',
        timeout: 5000,
      })
    );
    assert.equal(result.code, 1);
    assert.match(result.output.join('\n'), /recovery formats must be/u);
    const unrelated = result.modules.filter(
      (name) =>
        name.startsWith('sources/') ||
        name === 'server/index.js' ||
        name === 'cli/commands.js' ||
        name === 'cli/cv-commands.js' ||
        name === 'cli/forms-commands.js'
    );
    assert.deepEqual(
      unrelated,
      [],
      'serve imported unrelated command/provider code'
    );
  }
);
