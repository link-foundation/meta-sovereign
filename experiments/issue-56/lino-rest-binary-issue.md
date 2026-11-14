### Missing binary Links Notation transport

Using published `lino-rest-api@0.2.1` on Node.js 26.13.0, both binary media-type candidates are rejected by the codec. The current main source (`4d001039182934469854586758db7af4198f378d`) also lists only text representations and JSON.

```js
import { encodeFor, decodeFrom } from 'lino-rest-api';
encodeFor({ ok: true }, 'application/lino-binary');
// TypeError: Cannot encode to media type: application/lino-binary
decodeFrom(new Uint8Array(), 'application/lino-binary');
// TypeError: Cannot decode media type: application/lino-binary
```

Binary Links Notation should be negotiable by the server and supported by `LinoClient` using byte bodies/`response.arrayBuffer()`. JSON should remain independently configurable; consumers need text and binary LINO with JSON disabled.

Possible implementation: add a binary media-type constant, dispatch to `links-notation`'s `BinaryLinoCodec` with finite `DecodeLimits`, encode the typed object-codec AST and decode it back with `formatLinks` before object decoding. Use `codec.encode(new Parser().parse(encodeCompact({ obj })))` to preserve unary containers; `encodeText()` canonicalizes them. Merely parsing readable object text and printing its generic AST does not preserve the object codec's indentation semantics.

The bounded offline probe in [meta-sovereign PR 57](https://github.com/link-foundation/meta-sovereign/pull/57) round-trips Unicode, empty strings/collections, booleans, numeric-looking strings and nested collections using `links-notation@0.31.3` and `lino-objects-codec@0.9.5`. Consumers can use that adapter until native support ships. Request-byte limits and decoded graph limits should both be enforced.
