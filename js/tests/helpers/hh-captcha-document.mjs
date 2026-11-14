import assert from 'node:assert/strict';
import vm from 'node:vm';
import { applicationSelectors } from '../../src/jobs/application-page.js';

/** Poison payload access while retaining native challenge boundary metadata. */
export const hhCaptchaDocument = (
  marker,
  { completed = false, limit = false } = {}
) => {
  const reads = [];
  const poison = (kind) => {
    reads.push(kind);
    assert.fail(`Challenge payload access: ${kind}`);
  };
  const root = {
    tagName: 'INPUT',
    type: 'text',
    getAttribute: () => null,
    matches: () => false,
    querySelectorAll: () => [],
    closest: () => null,
    getClientRects: () => [1],
    get value() {
      return poison('answer');
    },
    get textContent() {
      return poison('instructions');
    },
  };
  const form = {
    contains: (node) => node === root,
    get outerHTML() {
      return poison('html');
    },
  };
  let clicks = 0;
  const target = {
    form,
    closest: () => null,
    getClientRects: () => [1],
    isConnected: true,
    click: () => clicks++,
  };
  const document = {
    location: { href: 'https://hh.ru/vacancy/123' },
    getElementById: () => null,
    get title() {
      return poison('title');
    },
    querySelectorAll: (selector) => {
      if (selector.includes(marker)) {
        return [root];
      }
      if (selector === applicationSelectors.submit) {
        return [target];
      }
      if (selector.startsWith('input,textarea')) {
        return [root];
      }
      if (completed && selector.includes('[name="smart-token"]')) {
        return [{ value: 'synthetic-completed-widget-token' }];
      }
      if (limit && selector.includes('negotiations-limit-exceeded')) {
        return [root];
      }
      return [];
    },
  };
  // Each invocation shares the same live document identity, as in a browser.
  const context = vm.createContext({
    document,
    location: document.location,
    URL,
    crypto: {
      randomUUID: () => 'synthetic-native-document',
      getRandomValues: (value) => value.fill(1),
    },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    target,
  });
  return {
    reads,
    get clicks() {
      return clicks;
    },
    evaluate(fn, input, native = false) {
      context.input = input;
      return vm.runInContext(
        native
          ? `(${fn.toString()})(target, input)`
          : `(${fn.toString()})(input)`,
        context
      );
    },
  };
};
