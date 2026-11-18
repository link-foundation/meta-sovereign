// Finite, network-free child used to verify the real installer process boundary.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const process = require('node:process');
assert.deepEqual(process.argv.slice(2), [
  'install',
  'chromium',
  '--no-shell',
  '--no-progress',
  '--no-remove',
]);
assert.equal(process.env.ELECTRON_RUN_AS_NODE, '1');
assert.notEqual(process.cwd(), path.dirname(process.argv[1]));
fs.writeFileSync(
  path.join(path.dirname(process.argv[1]), 'prepared-browser'),
  'synthetic executable',
  { mode: 0o700 }
);
