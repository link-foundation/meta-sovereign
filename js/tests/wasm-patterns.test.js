import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  instantiateWasmPatternMatcher,
  wasmPatternSourceSupported,
} from '../src/web/patterns-wasm.js';

test('wasm pattern matcher runs the Rust pattern_matches export', async () => {
  const bytes = await readFile('js/src/web/pattern-matcher.wasm');
  const matcher = await instantiateWasmPatternMatcher({ bytes });

  assert.equal(matcher.engine, 'wasm');
  assert.equal(matcher.matches('^hello\\s+\\S+$', 'hello alice'), true);
  assert.equal(matcher.matches('^hello\\s+\\S+$', 'bye alice'), false);
});

test('wasm pattern support detector leaves complex regexes to JS fallback', () => {
  assert.equal(wasmPatternSourceSupported('^hello\\s+\\S+$'), true);
  assert.equal(wasmPatternSourceSupported('^(?:hello|hi)$'), false);
  assert.equal(wasmPatternSourceSupported('^order\\s+\\d+$'), false);
});
