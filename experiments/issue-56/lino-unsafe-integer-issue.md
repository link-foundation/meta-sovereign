The current readable encoders change finite JavaScript Number values into strings when their decimal integer spelling exceeds `Number.MAX_SAFE_INTEGER`. This affects existing numeric values (for example amounts or counters), independently of precision already lost before serialization.

Reproduced with `lino-objects-codec@0.9.5`, `links-notation@0.31.3`, Node 26.13.0:

```js
import { encode, decode, encodeLine, decodeLine } from 'lino-objects-codec';
const value = { count: 1e18, nested: [-9007199254740992] };
console.log(decode({ notation: encode({ obj: value }) }));
console.log(decodeLine({ notation: encodeLine({ obj: value }) }));
// Both: { count: '1000000000000000000', nested: ['-9007199254740992'] }
// Expected: the original Number values and types.
```

Root cause: `src/readable.js`'s `formatNumber` returns `String(value)`, while `refToValue` deliberately preserves unsafe bare integers as strings. Encoding `1e18` as `1e+18` round-trips as a Number. A suggested change in `formatNumber`, after its existing special-number handling:

```js
if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
  return value.toExponential();
}
```

Please preserve numeric-looking string keys and values, bigint semantics, nested arrays/objects and safe integer formatting. Add readable and single-line regression cases for positive/negative unsafe integer Numbers, `1e18`, `1000000000000000100`, safe boundary values and matching strings. Compact/binary typed values already retain the Number type.

Workaround in [meta-sovereign PR 57](https://github.com/link-foundation/meta-sovereign/pull/57): use exponent notation only for unsafe integer Numbers through a shared adapter covering HTTP, sync, text-store records and recovery encoding. Ordinary documents retain upstream formatting. The bounded offline reproduction is `experiments/issue-56/lino-unsafe-integer-probe.mjs`; the regression is `js/tests/lino-transport.test.js` (`wire and HTTP replies preserve large numbers and numeric-looking keys`).
