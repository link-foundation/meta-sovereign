// Finite, isolated dependency-resolution and updater-cache compatibility probe.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'issue43-updater-'));
try {
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({
      private: true,
      dependencies: { 'electron-updater': '6.8.12' },
      overrides: {
        'electron-updater': {
          'lodash.isequal': 'npm:lodash.isequalwith@4.4.0',
        },
      },
    })
  );
  const output = execFileSync(
    'npm',
    ['install', '--ignore-scripts', '--no-fund'],
    {
      cwd: dir,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=512' },
    }
  );
  console.log(output);
  const require = createRequire(join(dir, 'package.json'));
  const updater = createRequire(
    require.resolve('electron-updater/package.json')
  );
  const pkg = updater('lodash.isequal/package.json');
  assert.equal(pkg.name, 'lodash.isequalwith');
  assert.equal(pkg.version, '4.4.0');
  assert.equal(pkg.deprecated, undefined);
  const equal = updater('lodash.isequal');
  const info = {
    version: '1.2.3',
    files: [{ url: 'app.zip', sha512: 'checksum', size: 144 }],
    releaseDate: '2026-10-28',
  };
  assert.equal(equal(info, globalThis.structuredClone(info)), true);
  assert.equal(equal(info, { ...info, version: '1.2.4' }), false);
  assert.equal(
    equal(info, { ...info, files: [{ ...info.files[0], sha512: 'changed' }] }),
    false
  );
  const { DownloadedUpdateHelper } = updater('./out/DownloadedUpdateHelper.js');
  const helper = new DownloadedUpdateHelper(dir);
  const file = join(dir, 'download.zip');
  await writeFile(file, 'fixture');
  const fileInfo = { info: info.files[0] };
  await helper.setDownloadedFile(
    file,
    null,
    info,
    fileInfo,
    'download.zip',
    false
  );
  assert.equal(
    await helper.validateDownloadedPath(
      file,
      globalThis.structuredClone(info),
      globalThis.structuredClone(fileInfo),
      console
    ),
    file
  );
  assert.equal(
    await helper.validateDownloadedPath(
      file,
      { ...info, version: '1.2.4' },
      fileInfo,
      console
    ),
    null
  );
  const lock = JSON.parse(
    await readFile(join(dir, 'package-lock.json'), 'utf8')
  );
  assert.equal(
    Object.values(lock.packages).some((p) => p.deprecated),
    false
  );
  console.log(
    'PASS: real updater reuses equal metadata, rejects changed metadata, and installs without deprecated packages.'
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
