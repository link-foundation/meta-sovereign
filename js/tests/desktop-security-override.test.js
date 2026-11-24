import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  DESKTOP_REQUIRED_FILES,
  desktopPackageJson,
  prepareDesktop,
} from '../scripts/prepare-desktop.mjs';

const manifest = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url))
);

test('desktop retains a resolvable private security override', () => {
  const pkg = desktopPackageJson(manifest);
  assert.equal(pkg.overrides.picomatch, '$picomatch');
  assert.equal(pkg.dependencies.picomatch, manifest.devDependencies.picomatch);
});

test('desktop stages the exact local security artifact without a source checkout', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'ms-desktop-security-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'root');
  for (const name of DESKTOP_REQUIRED_FILES) {
    const target = join(root, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, '');
  }
  await cp(
    new URL('../../vendor/picomatch', import.meta.url),
    join(root, 'vendor/picomatch'),
    { recursive: true }
  );
  await writeFile(join(root, 'package.json'), JSON.stringify(manifest));
  const out = join(directory, 'app');
  await prepareDesktop({ root, out, install: false });
  await rm(root, { recursive: true });
  const bytes = await readFile(
    join(out, manifest.devDependencies.picomatch.slice('file:'.length))
  );
  const provenance = JSON.parse(
    await readFile(join(out, 'vendor/picomatch/provenance.json'))
  );
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    provenance.archiveSha256
  );
});
