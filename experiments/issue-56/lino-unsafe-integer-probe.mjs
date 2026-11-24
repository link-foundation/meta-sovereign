// Finite upstream reproduction; no server, account or network is required.
import assert from 'node:assert/strict';
import { encode, decode, encodeLine, decodeLine } from 'lino-objects-codec';
import {
  encode as fixed,
  encodeLine as fixedLine,
} from '../../js/src/lino-objects.js';

const value = {
  count: 1e18,
  nested: [-9007199254740992],
  1000000000000000000: '1000000000000000000',
};
for (const [name, write, read, repaired] of [
  ['readable', encode, decode, fixed],
  ['single-line', encodeLine, decodeLine, fixedLine],
]) {
  const notation = write({ obj: value });
  const decoded = read({ notation });
  assert.equal(typeof decoded.count, 'string');
  assert.equal(typeof decoded.nested[0], 'string');
  assert.deepEqual(read({ notation: repaired({ obj: value }) }), value);
  console.log(
    JSON.stringify({
      form: name,
      notation,
      actual: decoded,
      workaround: 'passes',
    })
  );
}
