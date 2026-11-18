import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = fileURLToPath(new URL('../../', import.meta.url));
const options = { timeout: 10000, skip: process.platform === 'win32' };
const fixture = (t, extra = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'ms-dmg-cleanup-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const release = join(dir, 'dist/desktop/release');
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  for (const arch of ['mac', 'mac-arm64']) {
    mkdirSync(join(release, arch, 'Meta Sovereign.app/Contents'), {
      recursive: true,
    });
  }
  writeFileSync(
    join(release, 'meta-sovereign-desktop-macos-test.dmg'),
    'synthetic'
  );
  writeFileSync(join(release, 'latest-mac.yml'), 'synthetic');
  const mock = readFileSync(
    join(root, 'experiments/issue-56/macos-package-tools.sh')
  );
  for (const name of ['plutil', 'codesign', 'sleep', 'mktemp', 'hdiutil']) {
    writeFileSync(join(bin, name), mock, { mode: 0o755 });
  }
  const current = parse(
    readFileSync(join(root, '.github/workflows/desktop-release.yml'), 'utf8')
  );
  const step = (flow) =>
    flow.jobs.build.steps.find(({ name }) => name === 'Smoke test (macOS)');
  assert.equal(
    step(current).run.trim(),
    'bash js/scripts/verify-macos-packages.sh'
  );
  const command =
    process.env.MACOS_SMOKE_PARENT === '1'
      ? [
          '-c',
          step(
            parse(
              execFileSync(
                'git',
                ['show', '13806114:.github/workflows/desktop-release.yml'],
                { cwd: root, encoding: 'utf8' }
              )
            )
          ).run,
        ]
      : [join(root, 'js/scripts/verify-macos-packages.sh')];
  const result = spawnSync('bash', command, {
    cwd: dir,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      PROBE_ROOT: dir,
      ...extra,
    },
  });
  return {
    result,
    commands: readFileSync(join(dir, 'commands'), 'utf8').trim().split('\n'),
  };
};

test(
  'macOS package verification retries a transient busy owned DMG',
  options,
  (t) => {
    const { result, commands } = fixture(t);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(
      commands.filter((line) => line.startsWith('detach ')).length,
      2
    );
  }
);
test(
  'macOS verification failure still detaches its image and stays failed',
  options,
  (t) => {
    const { result, commands } = fixture(t, { FAIL_VERIFY: '1' });
    assert.equal(result.status, 7, result.stdout + result.stderr);
    assert.equal(
      commands.filter((line) => line.startsWith('detach ')).length,
      2
    );
  }
);
test(
  'only the owned read-only image has a bounded force-detach fallback',
  options,
  (t) => {
    const { result, commands } = fixture(t, { DETACH_MODE: 'force' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(commands.length, 5);
    assert.match(commands[0], /attach .* -nobrowse -readonly -mountpoint /u);
    assert.match(commands.at(-1), /^detach -force .*\/mounted$/u);
  }
);
test(
  'permanent detach refusal fails after four finite attempts',
  options,
  (t) => {
    const { result, commands } = fixture(t, { DETACH_MODE: 'permanent' });
    assert.notEqual(result.status, 0);
    assert.equal(
      commands.filter((line) => line.startsWith('detach ')).length,
      4
    );
    assert.match(result.stderr, /Unable to release owned test image/u);
  }
);
