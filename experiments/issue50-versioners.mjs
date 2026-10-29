// Execute both real release entry points in owned, disposable package fixtures.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { withoutReleaseVersion } from '../js/scripts/validated-release-tree.mjs';

const root = resolve('.');
for (const mode of ['changeset', 'instant']) {
  const cwd = mkdtempSync(join(tmpdir(), 'ms-versioner-'));
  try {
    for (const file of [
      'package.json',
      'package-lock.json',
      'CHANGELOG.md',
      '.changeset',
      'js/scripts',
    ]) {
      cpSync(join(root, file), join(cwd, file), { recursive: true });
    }
    symlinkSync(
      join(root, 'node_modules'),
      join(cwd, 'node_modules'),
      'junction'
    );
    writeFileSync(
      join(cwd, '.gitignore'),
      'node_modules/\n.fixture-remote.git/\n'
    );
    const git = (...args) => {
      const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
      assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
      return result.stdout.trim();
    };
    git('init', '-b', 'main');
    git('config', 'user.name', 'Release fixture');
    git('config', 'user.email', 'fixture@example.test');
    git('add', '.');
    git('commit', '-m', 'Validated fixture');
    git('init', '--bare', '.fixture-remote.git');
    git('remote', 'add', 'origin', join(cwd, '.fixture-remote.git'));
    git('push', 'origin', 'main');
    const before = readFileSync(join(cwd, 'package-lock.json'), 'utf8');
    const result = spawnSync(
      process.execPath,
      mode === 'changeset'
        ? ['js/scripts/version-and-commit.mjs', '--mode', 'changeset']
        : [
            'js/scripts/version-and-commit.mjs',
            '--mode',
            'instant',
            '--bump-type',
            'patch',
          ],
      {
        cwd,
        encoding: 'utf8',
        env: {
          ...process.env,
          HUSKY: '0',
          NODE_OPTIONS: '--max-old-space-size=256',
        },
      }
    );
    console.log(`Mode ${mode}\n${result.stdout}\n${result.stderr}`);
    assert.equal(result.status, 0);
    const after = readFileSync(join(cwd, 'package-lock.json'), 'utf8');
    assert.equal(
      withoutReleaseVersion('package-lock.json', after),
      withoutReleaseVersion('package-lock.json', before)
    );
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    assert.equal(JSON.parse(after).version, pkg.version);
    assert.equal(JSON.parse(after).packages[''].version, pkg.version);
    assert.equal(git('rev-parse', 'HEAD'), git('rev-parse', 'origin/main'));
    assert.equal(git('status', '--porcelain'), '');
    console.log(
      `${mode}: version ${pkg.version}; validated dependency tree preserved`
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
