import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { loadPreviousModule } from './previous-module.mjs';

const scripts = [
  ['application-search-route', 'application-route'],
  ['application-collection', 'application-collection'],
  ['application-preview', 'application-preview'],
];
if (process.argv[2] === '--worker') {
  const [, , , name, directory, revision] = process.argv;
  if (revision) {
    for (const module of [
      'mcp-inspection-code',
      'application-answer-context-mcp-runner',
      `${name}-mcp-runner`,
    ]) {
      loadPreviousModule(revision, `experiments/issue-56/${module}.mjs`);
    }
  }
  process.chdir(directory);
  await import(new URL(`${name}-mcp-runner.mjs`, import.meta.url));
} else {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mcp-fixture-'));
  const fixture = {
    base: '</script><script>globalThis.injected=true</script>\u2028\u2029',
    stats: 'quote\'"; backslash\\; </script>',
  };
  let failed = 0;
  try {
    await mkdir(path.join(directory, 'ci-logs'));
    for (const [name, prefix] of scripts) {
      const log = path.join(directory, `ci-logs/${prefix}-mcp-server.log`);
      await writeFile(log, `${JSON.stringify(fixture)}\n`);
      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(import.meta.url),
          '--worker',
          name,
          directory,
          ...(process.env.MCP_FIXTURE_REVISION
            ? [process.env.MCP_FIXTURE_REVISION]
            : []),
        ],
        { encoding: 'utf8', maxBuffer: 128 * 1024 }
      );
      assert.equal(result.status, 0, result.stderr);
      const code = await readFile(
        path.join(directory, `ci-logs/${prefix}-mcp-code.js`),
        'utf8'
      );
      new Script(`(${code})`);
      const escaped = !/<\/script|[\u2028\u2029]/u.test(code);
      console.log(JSON.stringify({ generator: name, escaped, compiled: true }));
      failed += Number(!escaped);
    }
    assert.equal(failed, 0, 'Fixture data escaped its generated-code boundary');
  } finally {
    await rm(directory, { recursive: true, force: true });
    console.log(
      'Owned temporary fixture files removed; no browser or provider opened.'
    );
  }
}
