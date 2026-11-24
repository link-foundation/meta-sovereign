/** Launch one Electron utility process directly from a small ASAR package. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPackage } from '@electron/asar';

const child = `import { readFile } from 'node:fs/promises';
import { token } from './marker.js';
const text = await readFile(new URL('./marker.txt', import.meta.url), 'utf8');
process.parentPort.on('message', ({ data }) => {
  if (data === 'close') process.exit(0);
});
process.parentPort.postMessage({ ready: token === text, packed: import.meta.url.includes('app.asar/') });
`;

const main = `const { app, utilityProcess } = require('electron');
const path = require('node:path');
app.setPath('userData', process.env.MS_DESKTOP_PROBE_HOME);
app.whenReady().then(() => {
  const child = utilityProcess.fork(path.join(__dirname, 'worker.mjs'), [], { stdio: 'inherit' });
  let ready = false;
  const timer = setTimeout(() => { child.kill(); app.exit(2); }, 10000);
  child.once('message', (value) => {
    ready = value.ready === true && value.packed === true;
    child.postMessage('close');
  });
  child.once('exit', (code) => {
    clearTimeout(timer);
    console.log(JSON.stringify({ ready, code, electron: process.versions.electron, node: process.versions.node }));
    app.exit(ready && code === 0 ? 0 : 1);
  });
});
`;

const fixture = await mkdtemp(
  join(tmpdir(), 'meta-sovereign-desktop-utility-')
);
const source = join(fixture, 'app');
const home = join(fixture, 'private-profile');
const archive = join(fixture, 'app.asar');
try {
  await Promise.all([mkdir(source), mkdir(home)]);
  await Promise.all(
    Object.entries({
      'package.json': JSON.stringify({ main: 'main.cjs', type: 'module' }),
      'main.cjs': main,
      'worker.mjs': child,
      'marker.js': `export const token = 'bundled';\n`,
      'marker.txt': 'bundled',
    }).map(([name, contents]) => writeFile(join(source, name), contents))
  );
  await createPackage(source, archive);
  const electron = process.env.DESKTOP_PROBE_ELECTRON;
  assert(electron, 'Set DESKTOP_PROBE_ELECTRON to the Electron executable');
  const result = spawnSync(
    electron,
    [
      '--disable-gpu',
      ...(process.env.DESKTOP_PROBE_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
      archive,
    ],
    {
      env: { ...process.env, MS_DESKTOP_PROBE_HOME: home },
      stdio: 'inherit',
    }
  );
  assert.equal(result.status, 0, result.error?.message ?? result.signal);
} finally {
  await rm(fixture, { recursive: true, force: true });
}
