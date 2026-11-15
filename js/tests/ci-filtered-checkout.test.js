import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';

test('runtime CI retains all history with a filtered checkout and the existing deadline', () => {
  const job = parse(
    readFileSync(
      new URL('../../.github/workflows/release.yml', import.meta.url),
      'utf8'
    )
  ).jobs.test;
  const checkout = job.steps.find((step) =>
    step.uses?.startsWith('actions/checkout@')
  );
  assert.equal(checkout.with.filter, 'blob:none');
  assert.equal(checkout.with['fetch-depth'], 0);
  assert.equal(checkout.with['persist-credentials'], false);
  assert.equal(job['timeout-minutes'], 10);
  assert.equal(job.strategy['fail-fast'], false);
  const merge = job.steps.find(
    ({ name }) => name === 'Simulate fresh merge with base branch (PR only)'
  );
  assert.equal(merge.run, 'bash js/scripts/simulate-fresh-merge.sh');
});

test(
  'a bounded filtered Git fixture preserves the full DAG, fresh-base merge and historical bytes',
  { timeout: 20000 },
  (t) => {
    const root = mkdtempSync(join(tmpdir(), 'ms-filtered-checkout-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const source = join(root, 'origin');
    const checkout = join(root, 'checkout');
    const invoke = (cwd, command, args, extra = {}) => {
      const result = spawnSync(command, args, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...extra },
      });
      assert.equal(
        result.status,
        0,
        `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`
      );
      return result.stdout.trim();
    };
    const git = (cwd, ...args) => invoke(cwd, 'git', args);
    git(root, 'init', '--initial-branch=main', source);
    git(source, 'config', 'user.email', 'fixture@example.invalid');
    git(source, 'config', 'user.name', 'Finite checkout fixture');
    git(source, 'config', 'commit.gpgsign', 'false');
    git(source, 'config', 'uploadpack.allowFilter', 'true');
    for (let index = 0; index < 8; index++) {
      writeFileSync(
        join(source, 'historical.bin'),
        Buffer.alloc(64 * 1024, index)
      );
      git(source, 'add', '.');
      git(source, 'commit', '-m', `finite historical blob ${index}`);
    }
    const shared = git(source, 'rev-parse', 'HEAD');
    git(source, 'checkout', '-b', 'feature');
    writeFileSync(join(source, 'feature.txt'), 'reviewed feature\n');
    git(source, 'add', '.');
    git(source, 'commit', '-m', 'feature');
    git(source, 'checkout', 'main');
    writeFileSync(join(source, 'base.txt'), 'fresh base\n');
    git(source, 'add', '.');
    git(source, 'commit', '-m', 'advance base');
    git(source, 'checkout', 'feature');
    git(
      root,
      'clone',
      '--filter=blob:none',
      '--no-checkout',
      pathToFileURL(source).href,
      checkout
    );
    git(checkout, 'checkout', 'feature');
    assert.equal(
      git(checkout, 'rev-list', '--count', '--all'),
      git(source, 'rev-list', '--count', '--all')
    );
    assert.equal(git(checkout, 'merge-base', 'HEAD', 'origin/main'), shared);
    const missing = () =>
      git(checkout, 'rev-list', '--objects', '--missing=print', '--all')
        .split('\n')
        .filter((line) => line.startsWith('?'));
    assert.ok(
      missing().length >= 7,
      'unused historical blobs remain untransferred'
    );
    invoke(
      checkout,
      'bash',
      [
        fileURLToPath(
          new URL('../scripts/simulate-fresh-merge.sh', import.meta.url)
        ),
      ],
      { BASE_REF: 'main' }
    );
    assert.equal(
      readFileSync(join(checkout, 'base.txt'), 'utf8'),
      'fresh base\n'
    );
    assert.equal(
      readFileSync(join(checkout, 'feature.txt'), 'utf8'),
      'reviewed feature\n'
    );
    assert.ok(
      missing().length >= 7,
      'merging the latest base does not download unrelated old blobs'
    );
    const historic = spawnSync('git', ['show', `${shared}~6:historical.bin`], {
      cwd: checkout,
      maxBuffer: 128 * 1024,
    });
    assert.equal(historic.status, 0, historic.stderr.toString());
    assert.deepEqual(historic.stdout, Buffer.alloc(64 * 1024, 1));
  }
);
