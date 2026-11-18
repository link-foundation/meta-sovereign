import assert from 'node:assert/strict';
import vm from 'node:vm';

/** Refuse all payload queries before a discovery reader returns its hold. */
export const hhDiscoveryDocument = (reader, marker, visible) => {
  const queries = [];
  const document = {
    querySelectorAll(selector) {
      if (selector.includes(marker)) {
        return [{ getClientRects: () => (visible ? [1] : []) }];
      }
      queries.push(selector);
      if (visible) {
        assert.fail(`Discovery payload read before verification: ${selector}`);
      }
      return [];
    },
  };
  const result = vm.runInNewContext(`(${reader.toString()})()`, {
    document,
    location: { href: 'https://hh.ru/search/vacancy?page=0' },
    URL,
  });
  return { result, queries };
};
