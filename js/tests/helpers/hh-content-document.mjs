import assert from 'node:assert/strict';
import vm from 'node:vm';

/** A boundary may be inspected; every content query is observable and poisoned. */
export const hhContentDocument = (marker, visible) => {
  const queries = [];
  const payload = (name) => {
    queries.push(name);
    if (visible) {
      assert.fail(`Content read before HH verification: ${name}`);
    }
  };
  const boundary = {
    getClientRects: () => (visible ? [1] : []),
    closest: () => (visible ? null : {}),
  };
  const document = {
    readyState: 'complete',
    contentType: 'text/html',
    body: null,
    querySelectorAll(selector) {
      if (selector.includes(marker)) {
        return [boundary];
      }
      if (/captcha|account-login-form/u.test(selector)) {
        return [];
      }
      payload(selector);
      return [];
    },
    querySelector(selector) {
      if (selector.includes(marker)) {
        return boundary;
      }
      if (/captcha|account-login-form|type="password"/u.test(selector)) {
        return null;
      }
      payload(selector);
      return null;
    },
    get title() {
      payload('title');
      return '';
    },
  };
  const context = vm.createContext({
    document,
    location: { href: 'https://hh.ru/resume/test', pathname: '/resume/test' },
    URL,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    DOMParser: class {
      parseFromString() {
        return document;
      }
    },
  });
  return {
    queries,
    evaluate(fn, input) {
      context.input = input;
      return vm.runInContext(`(${fn.toString()})(input)`, context);
    },
  };
};
