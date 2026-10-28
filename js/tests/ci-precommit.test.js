import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cli = resolve(
  dirname(require.resolve('lint-staged')),
  '../bin/lint-staged.js'
);

test(
  'pre-commit uses root configuration even beside staged reference package configs',
  { timeout: 30_000 },
  async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'issue43-precommit-'));
    const git = (...args) =>
      execFileSync('git', args, { cwd, encoding: 'utf8' });
    try {
      const hook = (
        await readFile(
          new URL('../../.husky/pre-commit', import.meta.url),
          'utf8'
        )
      )
        .trim()
        .split(/\s+/);
      assert.deepEqual(hook.slice(0, 2), ['npx', 'lint-staged']);
      const nested = join(cwd, 'dev/log/reference');
      await mkdir(nested, { recursive: true });
      await mkdir(join(cwd, 'src'));
      await writeFile(
        join(cwd, 'package.json'),
        JSON.stringify({ 'lint-staged': { '*.js': 'node root-check.mjs' } })
      );
      await writeFile(
        join(cwd, 'root-check.mjs'),
        "import {writeFileSync} from 'node:fs'; writeFileSync('root-ran', process.argv.slice(2).join('\\n'));\n"
      );
      await writeFile(
        join(nested, 'package.json'),
        JSON.stringify({ 'lint-staged': { '*.js': 'node nested-check.mjs' } })
      );
      await writeFile(
        join(nested, 'nested-check.mjs'),
        "throw new Error('A reference configuration must never run');\n"
      );
      for (const file of ['src/maintained.js', 'dev/log/reference/sample.js']) {
        await writeFile(join(cwd, file), '// original\n');
      }
      git('init', '-q');
      // This owned fixture writes LF files. Do not inherit the Windows
      // runner's global conversion policy or modify the user's Git settings.
      git('config', 'core.autocrlf', 'false');
      git('add', '.');
      git(
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        '-c',
        'core.hooksPath=',
        'commit',
        '-qm',
        'fixture'
      );
      for (const file of ['src/maintained.js', 'dev/log/reference/sample.js']) {
        await writeFile(join(cwd, file), '// changed\n');
      }
      git('add', '.');
      const child = spawnSync(
        'node',
        [cli, ...hook.slice(2), '--concurrent', '1'],
        { cwd, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }
      );
      assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
      const checked = await readFile(join(cwd, 'root-ran'), 'utf8');
      assert.ok(
        checked.includes('maintained.js'),
        'Maintained files must still be checked'
      );
      assert.ok(
        checked.includes('sample.js'),
        'Nested files must use root policy'
      );
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  }
);
