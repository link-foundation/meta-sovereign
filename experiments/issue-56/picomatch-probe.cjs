// Deliberately finite input; the caller bounds heap, stack, output and lifetime.
const assert = require('node:assert/strict');
const { isMatch } = require('picomatch');
const input = `${'a'.repeat(4096)}!`;
for (const pattern of ['+(*)a', '+(*a)', '*(a*)b', '+(a*b)c']) {
  assert.equal(isMatch(input, pattern), false);
}
