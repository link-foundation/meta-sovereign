import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parse } from 'yaml';

const runtimeJob = parse(
  readFileSync(
    new URL('../../.github/workflows/release.yml', import.meta.url),
    'utf8'
  )
).jobs.test;
const checkoutInputs = runtimeJob.steps.find((step) =>
  step.uses?.startsWith('actions/checkout@')
).with;

function assertWorktree(checkout, archived, required) {
  for (const path of archived) {
    assert.equal(existsSync(join(checkout, path)), false, path);
  }
  for (const path of required) {
    assert.equal(existsSync(join(checkout, path)), true, path);
  }
}

test('runtime CI retains all history with a filtered checkout and the existing deadline', () => {
  assert.equal(checkoutInputs.filter, 'blob:none');
  assert.equal(checkoutInputs['fetch-depth'], 0);
  assert.equal(checkoutInputs['persist-credentials'], false);
  assert.equal(checkoutInputs['sparse-checkout-cone-mode'], false);
  assert.deepEqual(checkoutInputs['sparse-checkout'].trim().split('\n'), [
    '/*',
    '!/docs/case-studies/issue-56/data/',
    '!/docs/screenshots/',
    '!/dev/log/',
  ]);
  assert.equal(runtimeJob['timeout-minutes'], 10);
  assert.equal(runtimeJob.strategy['fail-fast'], false);
  const merge = runtimeJob.steps.find(
    ({ name }) => name === 'Simulate fresh merge with base branch (PR only)'
  );
  assert.equal(merge.run, 'bash js/scripts/simulate-fresh-merge.sh');
});

test(
  'a bounded sparse Git fixture retains runtime inputs, fresh-base merges and archived bytes',
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
    git(source, 'config', 'core.autocrlf', 'true');
    git(source, 'config', 'uploadpack.allowFilter', 'true');
    const archived = [
      'docs/case-studies/issue-56/data/receipt.bin',
      'docs/screenshots/receipt.bin',
      'dev/log/receipt.bin',
    ];
    const required = [
      'js/src/runtime.js',
      'js/tests/fixture.txt',
      '.github/actions/node-tests/action.yml',
      'docs/case-studies/issue-18/README.md',
      'docs/case-studies/issue-56/PLAN.md',
    ];
    const write = (path, bytes) => {
      mkdirSync(join(source, path, '..'), { recursive: true });
      writeFileSync(join(source, path), bytes);
    };
    for (const path of archived) {
      write(path, Buffer.alloc(64 * 1024, 9));
    }
    for (const path of required) {
      write(path, 'required runtime input\n');
    }
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
    write(archived[0], Buffer.alloc(64 * 1024, 10));
    write(required[0], 'fresh runtime input\n');
    git(source, 'add', '.');
    git(source, 'commit', '-m', 'advance base');
    git(source, 'checkout', 'feature');
    git(
      root,
      'clone',
      '--config=core.autocrlf=true',
      '--filter=blob:none',
      '--no-checkout',
      pathToFileURL(source).href,
      checkout
    );
    // Match checkout v7's non-cone configuration before its first checkout.
    git(checkout, 'config', 'core.sparseCheckout', 'true');
    writeFileSync(
      join(checkout, '.git/info/sparse-checkout'),
      checkoutInputs['sparse-checkout']
    );
    git(checkout, 'checkout', 'feature');
    assertWorktree(checkout, archived, required);
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
    const verifyArchiveUnfetched = () => {
      const archiveId = git(checkout, 'rev-parse', `HEAD:${archived[0]}`);
      assert.ok(
        missing().includes(`?${archiveId}`),
        'archive blob remains unfetched'
      );
    };
    verifyArchiveUnfetched();
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
      'fresh base\r\n'
    );
    assert.equal(
      readFileSync(join(checkout, 'feature.txt'), 'utf8'),
      'reviewed feature\r\n'
    );
    assertWorktree(checkout, archived, required);
    assert.equal(
      readFileSync(join(checkout, required[0]), 'utf8'),
      'fresh runtime input\r\n'
    );
    const archive = spawnSync('git', ['show', `HEAD:${archived[0]}`], {
      cwd: checkout,
      maxBuffer: 128 * 1024,
    });
    assert.equal(archive.status, 0, archive.stderr.toString());
    assert.deepEqual(archive.stdout, Buffer.alloc(64 * 1024, 10));
    assertWorktree(checkout, archived, required);
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
