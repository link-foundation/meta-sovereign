import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  installResumeInputTrace,
  readResumeInputTrace,
} from './helpers/e2e-resume-input.mjs';

test('resume input tracing is optional and records at most 32 value-free events', async () => {
  const listeners = new Map();
  const field = {
    tagName: 'INPUT',
    type: 'text',
    value: 'Private owner input must never be logged',
    getAttribute: () => 'resume',
  };
  const document = {
    activeElement: field,
    visibilityState: 'visible',
    readyState: 'complete',
    addEventListener: (type, listener) => listeners.set(type, listener),
    querySelector: (selector) =>
      selector.includes('data-vacancy-field') ? field : { disabled: true },
  };
  const context = vm.createContext({ document });
  let installed = 0;
  const page = {
    addInitScript: async (script) => {
      installed++;
      vm.runInContext(`(${script.toString()})()`, context);
    },
  };
  await installResumeInputTrace(page, false);
  assert.equal(installed, 0);
  await installResumeInputTrace(page, true);
  for (let i = 0; i < 40; i++) {
    listeners.get('input')({
      target: field,
      isTrusted: true,
      key: 'Private key',
    });
  }
  const state = vm.runInContext(
    `(${readResumeInputTrace.toString()})()`,
    context
  );
  assert.equal(state.events.length, 32);
  assert.equal(state.invalidHash, false);
  assert.equal(state.focused, true);
  assert.equal(state.searchDisabled, true);
  assert.equal(state.valueLength, field.value.length);
  assert(!JSON.stringify(state).includes('Private'));
  field.value = 'invalid/hash';
  assert.equal(
    vm.runInContext(`(${readResumeInputTrace.toString()})()`, context)
      .invalidHash,
    true
  );
});
