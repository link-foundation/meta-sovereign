import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import {
  installResumeInputTrace,
  readResumeInputTrace,
  traceResumeInput,
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
    querySelectorAll: () => [],
  };
  const context = vm.createContext({ document });
  let installed = 0;
  const page = Object.assign(new EventEmitter(), {
    addInitScript: async (script) => {
      installed++;
      vm.runInContext(`(${script.toString()})()`, context);
    },
  });
  await installResumeInputTrace(page, false);
  assert.equal(installed, 0);
  assert.deepEqual(page.eventNames(), []);
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

test('resume request tracing bounds allowed paths and omits query strings and bodies', async (t) => {
  const page = Object.assign(new EventEmitter(), {
    addInitScript: async () => {},
    evaluate: async () => ({ events: [] }),
  });
  const output = [];
  const original = console.error;
  t.after(() => {
    console.error = original;
  });
  console.error = (...args) => output.push(args);
  await installResumeInputTrace(page, true);
  const request = (path) => ({
    url: () => `http://127.0.0.1${path}?private=owner-secret`,
    postData: () => {
      throw new Error('Request bodies must not be read');
    },
  });
  page.emit('request', request('/api/private'));
  await traceResumeInput(page, 'ignored', true);
  assert.deepEqual(JSON.parse(output.pop()[1]).requests, []);
  for (let index = 0; index < 40; index++) {
    page.emit('request', request('/api/vacancies/resumes'));
  }
  page.emit('response', {
    request: () => request('/api/vacancies/resumes-stored'),
    status: () => 200,
  });
  page.emit('requestfailed', request('/api/vacancies/resumes'));
  await traceResumeInput(page, 'bounded', true);
  const [marker, raw] = output.pop();
  assert.equal(marker, '[resume-input]');
  assert.equal(raw.includes('owner-secret'), false);
  const state = JSON.parse(raw);
  assert.equal(state.phase, 'bounded');
  assert.equal(state.requests.length, 32);
  assert.deepEqual(state.requests.slice(-2), [
    { path: '/api/vacancies/resumes-stored', phase: 'responded', status: 200 },
    { path: '/api/vacancies/resumes', phase: 'failed' },
  ]);
  assert(
    state.requests.every(({ path }) =>
      path.startsWith('/api/vacancies/resumes')
    )
  );
});
