import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { isMatch, makeRe } = require('picomatch');

test('picomatch keeps glob semantics without repeated wildcard quantifiers', () => {
  for (const [pattern, yes, no] of [
    ['+(*)c', ['abc', 'c'], ['ab!']],
    ['+(*a)', ['a', 'aba', 'aaa'], ['b', 'aaa!']],
    ['+(a*)', ['a', 'aba'], ['b']],
    ['+(a*b)', ['ab', 'abab', 'acbab'], ['a', 'aba']],
    ['+(a*b*c)', ['abc', 'abcabc', 'axbyc'], ['ab', 'abc!']],
    ['*(a*b)c', ['c', 'abc', 'ababc'], ['abb']],
    ['x+(*a)y', ['xay', 'xabaay'], ['xby']],
  ]) {
    assert.doesNotMatch(makeRe(pattern).source, /\)[+*]/u, pattern);
    for (const input of yes) {
      assert.equal(isMatch(input, pattern), true, `${pattern}: ${input}`);
    }
    for (const input of no) {
      assert.equal(isMatch(input, pattern), false, `${pattern}: ${input}`);
    }
  }
  assert.equal(isMatch('*a*a', '+(\\*a)'), true);
  assert.equal(isMatch('foobar', '+(foo|bar)'), true);
  assert.equal(isMatch('js/tests/a.test.js', '**/*.test.js'), true);
  assert.equal(isMatch('.hidden/file.js', '**/*.js'), false);
  assert.equal(isMatch('.hidden/file.js', '**/*.js', { dot: true }), true);
  assert.match(makeRe('+(*a)', { maxExtglobRecursion: false }).source, /\)\+/u);
});

test(
  'picomatch rejects finite hostile inputs in a bounded child',
  { timeout: 5000 },
  () => {
    execFileSync(
      // Node is installed for every CI runtime; keep V8 limits effective
      // when the surrounding portable test runs under Bun or Deno.
      'node',
      [
        '--max-old-space-size=32',
        '--stack-size=256',
        require.resolve('../../experiments/issue-56/picomatch-probe.cjs'),
      ],
      { timeout: 2000, killSignal: 'SIGKILL', maxBuffer: 16384, stdio: 'pipe' }
    );
  }
);

test('installed private picomatch matches every reviewed runtime hash', () => {
  const provenance = JSON.parse(
    readFileSync(
      new URL('../../vendor/picomatch/provenance.json', import.meta.url)
    )
  );
  const directory = dirname(require.resolve('picomatch/package.json'));
  const packageInfo = require('picomatch/package.json');
  assert.equal(packageInfo.name, 'meta-sovereign-picomatch');
  assert.equal(packageInfo.version, '4.0.7+patched.1');
  for (const [name, expected] of Object.entries(provenance.after)) {
    const actual = createHash('sha256')
      .update(readFileSync(join(directory, name)))
      .digest('hex');
    assert.equal(actual, expected, name);
  }
});

test('tinyglobby discovers matching files through the patched dependency', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'meta-sovereign-glob-'));
  try {
    mkdirSync(join(directory, 'nested'));
    writeFileSync(join(directory, 'nested', 'sample.js'), '');
    writeFileSync(join(directory, 'nested', 'sample.txt'), '');
    writeFileSync(join(directory, '.hidden.js'), '');
    const { glob } = require('tinyglobby');
    assert.deepEqual(await glob('**/*.js', { cwd: directory }), [
      'nested/sample.js',
    ]);
    assert.deepEqual(
      (await glob('**/*.js', { cwd: directory, dot: true })).sort(),
      ['.hidden.js', 'nested/sample.js']
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
