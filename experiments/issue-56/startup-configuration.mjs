// Finite actual-dispatch regression. No store, server or provider is opened.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatIndented } from 'lino-objects-codec';

const runnerUrl = new URL(
  '../../js/src/cli/command-runner.js',
  import.meta.url
);
let moduleUrl = runnerUrl;
if (process.argv.includes('--before')) {
  const source = execFileSync(
    'git',
    ['show', '36ee8ba8:js/src/cli/command-runner.js'],
    {
      encoding: 'utf8',
    }
  ).replace(
    /from '(\.\.?\/[^']+)'/g,
    (_, specifier) => `from '${new URL(specifier, runnerUrl).href}'`
  );
  moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const { runCliCommand } = await import(moduleUrl);
const cwd = await mkdtemp(join(tmpdir(), 'startup-config-probe-'));
try {
  const globalDir = join(cwd, 'user');
  const localDir = join(cwd, 'app');
  await mkdir(globalDir);
  await mkdir(localDir);
  await writeFile(
    join(globalDir, 'config.lino'),
    formatIndented({
      id: 'configuration',
      obj: { server: { port: 9100, verbose: true } },
    })
  );
  await writeFile(
    join(localDir, 'config.lino'),
    formatIndented({
      id: 'configuration',
      obj: { server: { port: 9200, verbose: false } },
    })
  );
  let observed;
  const code = await runCliCommand(
    ['serve', '--store=unused-fixture'],
    (args) => {
      observed = { port: args.port ?? null, verbose: args.verbose ?? null };
      return 0;
    },
    { configuration: { cwd, globalDir, localDir } }
  );
  console.log(
    JSON.stringify({
      before: process.argv.includes('--before'),
      code,
      observed,
    })
  );
  assert.equal(code, 0);
  assert.deepEqual(observed, { port: 9200, verbose: false });
} finally {
  await rm(cwd, { recursive: true, force: true });
}
