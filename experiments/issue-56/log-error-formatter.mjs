import assert from 'node:assert/strict';
import { redactLogValue } from '../../js/src/server/log-value.js';

// This process owns the global formatter and exits after one finite probe.
let invoked = 0;
const error = new Error('visible fixture');
Object.defineProperty(Error, 'prepareStackTrace', {
  configurable: true,
  writable: true,
  value: () => {
    invoked++;
    return 'fixture-sensitive';
  },
});
const logged = redactLogValue(error);
assert.equal(invoked, 0);
assert.equal(logged.message, 'visible fixture');
assert.equal(logged.stack, '[accessor]');
console.log('formatter remained unused');
