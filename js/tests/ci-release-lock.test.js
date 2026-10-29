import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncReleaseLock } from '../scripts/sync-release-lock.mjs';
import { withoutReleaseVersion } from '../scripts/validated-release-tree.mjs';

test(
  'release lock synchronization preserves the validated dependency tree',
  { timeout: 30000 },
  (t) => {
    const cwd = mkdtempSync(join(tmpdir(), 'ms-release-lock-'));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
    );
    const before = readFileSync(
      new URL('../../package-lock.json', import.meta.url),
      'utf8'
    );
    pkg.version = `${Number(pkg.version.split('.')[0]) + 1}.0.0`;
    writeFileSync(join(cwd, 'package.json'), JSON.stringify(pkg));
    writeFileSync(join(cwd, 'package-lock.json'), before);
    syncReleaseLock(cwd);
    const after = readFileSync(join(cwd, 'package-lock.json'), 'utf8');
    assert.equal(JSON.parse(after).version, pkg.version);
    assert.equal(JSON.parse(after).packages[''].version, pkg.version);
    assert.equal(
      withoutReleaseVersion('package-lock.json', after),
      withoutReleaseVersion('package-lock.json', before),
      'a version-only release must retain every validated peer and dependency'
    );
  }
);
