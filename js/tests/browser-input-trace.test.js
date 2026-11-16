import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { traceBrowserInputs, inputTrace } from './helpers/e2e-input-trace.mjs';

test('input diagnostics distinguish native and rendered values without retaining text', async () => {
  const listeners = new Map();
  const field = {
    tagName: 'TEXTAREA',
    value: 'private native input',
    defaultValue: '',
    attributes: [{ name: 'data-vacancy-field', value: 'excludeText' }],
    closest: () => field,
    getAttribute: (name) =>
      name === 'data-vacancy-field' ? 'excludeText' : null,
    matches: () => false,
  };
  const document = {
    activeElement: field,
    hasFocus: () => true,
    querySelector: () => null,
    querySelectorAll: () => [field],
  };
  const context = vm.createContext({
    document,
    addEventListener: (type, listener) => listeners.set(type, listener),
  });
  let initialScript;
  const page = {
    addInitScript: async (fn, arg) => {
      initialScript = [fn, arg];
    },
    evaluate: async (fn, arg) =>
      vm.runInContext(`(${fn.toString()})(${JSON.stringify(arg)})`, context),
    on: () => {},
  };
  await traceBrowserInputs(page, '[data-vacancy-field]');
  assert.equal(initialScript[1], '[data-vacancy-field]');
  assert.equal(listeners.has('focusout'), true);
  for (let i = 0; i < 70; i++) {
    listeners.get('input')({ type: 'input', target: field, isTrusted: true });
  }
  const state = await inputTrace(page);
  assert.equal(state.events.length, 60);
  assert.equal(state.events[0].node, 1);
  assert.equal(state.events[0].length, field.value.length);
  assert.equal(state.events[0].renderedLength, 0);
  assert.equal(state.events[0].focused, true);
  assert.equal(state.controls[0].renderedMatches, false);
  assert.equal(state.controls[0].field, 'excludeText');
  assert.equal(JSON.stringify(state).includes('private'), false);
  field.defaultValue = field.value;
  assert.equal((await inputTrace(page)).controls[0].renderedMatches, true);
  const replacement = { ...field };
  replacement.closest = () => replacement;
  listeners.get('focusin')({ type: 'focusin', target: replacement });
  assert.equal((await inputTrace(page)).events.at(-1).node, 2);
  // The same installer also runs in the next document, before input entry.
  await page.evaluate(...initialScript);
  assert.equal((await inputTrace(page)).events.length, 0);
});
