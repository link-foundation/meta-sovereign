import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { emptyCv, isCvPath } from '../src/cv/model.js';
import { assignPath, mergeCv } from '../src/cv/runner.js';
import { applyFlatChanges } from '../src/cv/diff.js';
import { safeMessage } from '../src/server/redact.js';
import { json } from '../src/server/util.js';
import { sanitizeSvg } from '../src/sources/telegram-wallpapers.js';
import {
  detectGreetingLanguage,
  greetingPatterns,
} from '../src/greetings/detect.js';

test('CV writes accept only canonical sections and fields', () => {
  const cv = emptyCv();
  const before = globalThis.structuredClone(cv);
  for (const path of [
    '__proto__.polluted',
    'constructor.polluted',
    'basics.__proto__',
    'basics.surprise',
  ]) {
    assert.equal(isCvPath(path), false);
    assert.throws(() => assignPath(cv, path, 'bad'), /unknown CV path/);
    assert.deepEqual(applyFlatChanges(cv, [{ path, value: 'bad' }]), before);
  }
  mergeCv(
    cv,
    JSON.parse('{"basics":{"__proto__":{"polluted":true},"surprise":"bad"}}'),
    ['basics']
  );
  assert.deepEqual(cv, before);
  assert.equal(Object.prototype.polluted, undefined);
  assignPath(cv, 'basics.name', 'Anna');
  assert.equal(cv.basics.name, 'Anna');
});

test('error answers never stringify an arbitrary thrown object', () => {
  const thrown = {
    toString: () => 'Error: secret\n    at /private/server.js:1:2',
  };
  assert.equal(safeMessage(thrown), 'unknown error');
  assert.equal(safeMessage(new Error('read failed')), 'read failed');
  assert.equal(safeMessage('read failed'), 'read failed');
});

test('error messages never expose frames from a thrown stack string', () => {
  const stack = 'read failed\n    at /private/server.js:1:2';
  assert.equal(safeMessage(stack), 'read failed');
  assert.equal(safeMessage(new Error(stack)), 'read failed');
  assert.equal(
    safeMessage('read failed\r\n    at private.js:1:2'),
    'read failed'
  );
});

test('JSON error answers use the same safe message boundary', () => {
  const responses = [];
  const res = {
    writeHead() {},
    end(body) {
      responses.push(JSON.parse(body));
    },
  };
  const dangerous = {
    toString() {
      throw new Error('must not stringify');
    },
  };
  json(res, 500, { error: dangerous });
  json(res, 502, { error: new Error('read failed\n    at private.js:1:2') });
  json(res, 400, { error: 'Bearer secret123\n    at private.js:1:2' });
  assert.deepEqual(
    responses.map((body) => body.error),
    ['unknown error', 'read failed', 'Bearer <redacted>']
  );
  assert.equal(responses[0].code, 'internal');
  assert.equal(responses[0].ok, false);
});

test('SVG sanitization rejects escaped CSS resource loads', () => {
  const clean = sanitizeSvg(
    '<svg><rect style="fill:u\\72l(https://private.test/x)"/><path fill="url(https://private.test/y)"/></svg>'
  );
  assert.doesNotMatch(clean, /private\.test|\\72/);
});

test('SVG sanitization preserves safe text, filters and inline drawing styles', () => {
  const clean = sanitizeSvg(
    '<svg><defs><filter id="soft"><feGaussianBlur stdDeviation="2"/></filter></defs><text x="4" style="fill:red;font-size:12;filter:url(#soft)">Hello</text><path fill="blue" style="fill:green;stroke-width:2"/></svg>'
  );
  assert.match(clean, /<text[^>]*>Hello<\/text>/);
  assert.match(
    clean,
    /<filter id="soft"><feGaussianBlur stdDeviation="2"\/><\/filter>/
  );
  assert.match(clean, /fill="red"/);
  assert.match(clean, /font-size="12"/);
  assert.match(clean, /filter="url\(#soft\)"/);
  assert.match(clean, /fill="green"/);
  assert.doesNotMatch(clean, /fill="blue"/);
  assert.match(clean, /stroke-width="2"/);
});

test('linear greeting detection preserves emoji tokens and addressees', () => {
  for (const pattern of Object.values(greetingPatterns)) {
    assert.equal(pattern.test('👋!'), true);
  }
  assert.equal(detectGreetingLanguage('👋 there!'), 'en');
  assert.equal(detectGreetingLanguage('👋 вам!'), 'ru');
  assert.equal(detectGreetingLanguage('🙂 there!'), null);
});

test(
  'greeting rejection completes within a bounded subprocess',
  { skip: Boolean(globalThis.Bun || globalThis.Deno) },
  () => {
    const result = execFileSync(
      process.execPath,
      [
        '--max-old-space-size=96',
        '--stack-size=512',
        '--input-type=module',
        '-e',
        "import {isGreetingText} from './js/src/greetings/detect.js'; console.log(isGreetingText('q'.repeat(32)+'x'));",
      ],
      {
        cwd: new URL('../../', import.meta.url),
        encoding: 'utf8',
        timeout: 2000,
      }
    );
    assert.equal(result.trim(), 'false');
  }
);
