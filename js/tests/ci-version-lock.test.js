import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'ms-version-lock-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

for (const subdir of ['', 'js']) {
  test(`version bump preserves every locked dependency (${subdir || 'root'} package)`, async (t) => {
    const { syncLockfileVersion } =
      await import('../scripts/sync-lockfile-version.mjs');
    const { withoutReleaseVersion } =
      await import('../scripts/validated-release-tree.mjs');
    const dir = join(fixture(t), subdir);
    mkdirSync(dir, { recursive: true });
    // The actual issue-52 lockfile includes the peer package removed by npm's
    // --legacy-peer-deps resolution. Keep the entire locked graph in this test.
    const before = readFileSync(
      new URL('../../package-lock.json', import.meta.url),
      'utf8'
    );
    const manifest = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url))
    );
    manifest.version = '1.0.0';
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest));
    writeFileSync(join(dir, 'package-lock.json'), before);
    syncLockfileVersion({ jsRoot: dir });
    const after = readFileSync(join(dir, 'package-lock.json'), 'utf8');
    const lock = JSON.parse(after);
    assert.equal(lock.version, '1.0.0');
    assert.equal(lock.packages[''].version, '1.0.0');
    assert.equal(
      withoutReleaseVersion('package-lock.json', after),
      withoutReleaseVersion('package-lock.json', before)
    );
    syncLockfileVersion({ jsRoot: dir });
    assert.equal(readFileSync(join(dir, 'package-lock.json'), 'utf8'), after);
  });
}

test('unsupported or inconsistent lockfiles fail before writing', async (t) => {
  const { syncLockfileVersion } =
    await import('../scripts/sync-lockfile-version.mjs');
  const dir = fixture(t);
  writeFileSync(
    join(dir, 'package.json'),
    '{"name":"fixture","version":"2.0.0"}'
  );
  for (const lock of [
    { lockfileVersion: 1, version: '1.0.0' },
    { lockfileVersion: 3, version: '1.0.0', packages: {} },
    {
      lockfileVersion: 3,
      version: '1.0.0',
      packages: { '': { name: 'other', version: '1.0.0' } },
    },
  ]) {
    const text = JSON.stringify(lock);
    writeFileSync(join(dir, 'package-lock.json'), text);
    assert.throws(() => syncLockfileVersion({ jsRoot: dir }), /lockfile/i);
    assert.equal(readFileSync(join(dir, 'package-lock.json'), 'utf8'), text);
  }
});

test('both release modes synchronize versions without resolving dependencies', () => {
  for (const name of ['changeset-version', 'instant-version-bump']) {
    const source = readFileSync(
      new URL(`../scripts/${name}.mjs`, import.meta.url),
      'utf8'
    );
    assert.doesNotMatch(source, /npm install|legacy-peer-deps/);
    assert.match(source, /syncLockfileVersion\(\{ jsRoot \}\)/);
  }
});
