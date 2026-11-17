import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, access, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(
  new URL('../scripts/wait-windows-uninstall.ps1', import.meta.url)
);
const options = { skip: process.platform !== 'win32', timeout: 15000 };
const launch = (directory, milliseconds) =>
  spawn(
    'pwsh',
    [
      '-NoProfile',
      '-NonInteractive',
      '-File',
      script,
      '-Directory',
      directory,
      '-MaxWaitMilliseconds',
      String(milliseconds),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

const fixture = async (t, milliseconds) => {
  const owned = await mkdtemp(join(tmpdir(), 'ms-uninstall-fixture-'));
  t.after(() => rm(owned, { recursive: true, force: true }));
  const installed = join(owned, 'application');
  await mkdir(installed);
  const resource = join(installed, 'remaining-native-library.dll');
  await writeFile(resource, 'synthetic resource; app.exe already removed');
  const child = launch(installed, milliseconds);
  t.after(() => {
    if (child.exitCode === null) {
      child.kill();
    }
  });
  let error = '';
  child.stderr.on('data', (chunk) => {
    error += chunk;
  });
  const completion = once(child, 'close');
  await once(child.stdout, 'data');
  await access(resource);
  return { installed, resource, child, completion, error: () => error };
};

test(
  'Windows cleanup waits for resources after the executable disappears',
  options,
  async (t) => {
    const { installed, child, completion } = await fixture(t, 5000);
    assert.equal(
      child.exitCode,
      null,
      'remaining resources must keep cleanup waiting'
    );
    await rm(installed, { recursive: true });
    const [code] = await completion;
    assert.equal(code, 0);
  }
);

test(
  'Windows cleanup fails finitely when the uninstaller leaves resources',
  options,
  async (t) => {
    const { resource, completion, error } = await fixture(t, 100);
    const [code] = await completion;
    assert.notEqual(code, 0);
    assert.match(error(), /left the installation directory behind/u);
    await access(resource);
  }
);
