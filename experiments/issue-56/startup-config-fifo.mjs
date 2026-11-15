// Finite POSIX probe: a private FIFO must refuse without waiting for a writer.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'startup-config-fifo-'));
const globalDir = join(directory, 'user');
await mkdir(globalDir);
execFileSync('mkfifo', [join(globalDir, 'config.lino')]);
const deadline = globalThis.setTimeout(() => {
  // A blocked libuv open can also prevent ordinary process.exit teardown.
  // Remove only this private fixture, then terminate every thread definitively.
  rmSync(directory, { recursive: true, force: true });
  writeSync(1, `${JSON.stringify({ blockedBeforeRegularFileCheck: true })}\n`);
  process.kill(process.pid, 'SIGKILL');
}, 3000);
try {
  const url = new URL(
    '../../js/src/cli/startup-configuration.js',
    import.meta.url
  );
  let target = url.href;
  if (process.argv.includes('--before')) {
    const source = execFileSync(
      'git',
      ['show', '425e6ce6:js/src/cli/startup-configuration.js'],
      { encoding: 'utf8' }
    );
    const rebased = source.replace(
      /from (['"])([^'"]+)\1/g,
      (_match, _quote, name) =>
        `from ${JSON.stringify(name.startsWith('.') ? new URL(name, url).href : import.meta.resolve(name))}`
    );
    target = `data:text/javascript;base64,${Buffer.from(rebased).toString('base64')}`;
  }
  const { startupArguments } = await import(target);
  await assert.rejects(
    startupArguments({}, { globalDir, localDir: join(directory, 'local') }),
    { code: 'INVALID_APP_CONFIGURATION' }
  );
  console.log(JSON.stringify({ fifoRefused: true, openedServer: false }));
} finally {
  globalThis.clearTimeout(deadline);
  await rm(directory, { recursive: true, force: true });
}
