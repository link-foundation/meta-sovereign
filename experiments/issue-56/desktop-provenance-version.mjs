// Exercise the real provenance shell with a deliberately unavailable npm CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('yaml');

test(
  'desktop provenance reads installed metadata without launching a packaging CLI',
  { timeout: 10_000 },
  async () => {
    const source = process.argv.includes('--before')
      ? spawnSync(
          'git',
          ['show', '0f245481:.github/workflows/desktop-release.yml'],
          { encoding: 'utf8' }
        ).stdout
      : await readFile('.github/workflows/desktop-release.yml', 'utf8');
    const step = yaml
      .parse(source)
      .jobs.build.steps.find(({ name }) => name === 'Checksums and provenance');
    const directory = await mkdtemp(join(tmpdir(), 'ms-provenance-'));
    try {
      for (const name of [
        'bin',
        'node_modules/electron-builder',
        'dist/desktop/release',
      ]) {
        await mkdir(join(directory, name), { recursive: true });
      }
      await writeFile(join(directory, 'bin/npx'), '#!/bin/sh\nexit 86\n', {
        mode: 0o700,
      });
      await writeFile(
        join(directory, 'node_modules/electron-builder/package.json'),
        '{"version":"26.9.1"}'
      );
      const release = join(directory, 'dist/desktop/release');
      await writeFile(
        join(release, 'meta-sovereign-desktop-fixture.exe'),
        'finite installer fixture'
      );
      await writeFile(
        join(release, 'meta-sovereign-desktop-fixture.exe.blockmap'),
        'blockmap'
      );
      await writeFile(join(release, 'latest.yml'), 'version: 1.2.0\n');
      const result = spawnSync(
        'bash',
        ['--noprofile', '--norc', '-c', step.run],
        {
          cwd: directory,
          encoding: 'utf8',
          env: {
            ...process.env,
            PATH: `${join(directory, 'bin')}:${process.env.PATH}`,
            BUILD_NAME: 'fixture',
            BUILD_RUNNER: 'finite-local',
            BUILD_REF: 'fixture-sha',
            RUNNER_OS: 'fixture-os',
            RUNNER_ARCH: 'fixture-arch',
            META_SOVEREIGN_ELECTRON_VERSION: '45.3.2',
            MAC_SIGNING: '',
          },
        }
      );
      assert.equal(result.status, 0, result.stderr);
      const provenance = await readFile(
        join(release, 'provenance-fixture.txt'),
        'utf8'
      );
      assert.match(provenance, /electron-builder: 26\.9\.1/u);
      assert.match(provenance, /commit: fixture-sha/u);
      assert.match(provenance, /latest\.yml/u);
      assert.doesNotMatch(provenance, /blockmap/u);
      const hashes = await readFile(
        join(release, 'SHA256SUMS-fixture.txt'),
        'utf8'
      );
      assert.match(
        hashes,
        /^[a-f0-9]{64} {2}meta-sovereign-desktop-fixture\.exe\n$/u
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
);
