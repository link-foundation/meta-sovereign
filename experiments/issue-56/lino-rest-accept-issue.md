### A wildcard overrides an explicitly forbidden representation

Reproduced with published `lino-rest-api@0.2.1` on Node.js 26.13.0. Current main (`4d001039182934469854586758db7af4198f378d`) has the same range-first selection in `js/src/media-type.js`.

```js
import { negotiateMediaType } from 'lino-rest-api';
console.log(negotiateMediaType('text/lino;q=0, */*;q=1', ['text/lino']));
// Actual: text/lino
// Expected: null (the only supported representation is explicitly excluded)
```

RFC 9110 section 12.5.1 gives the more specific range precedence when determining a representation's quality. A client can therefore receive a format it explicitly refused. The issue also affects two accepted formats with different explicit quality values plus a higher-quality wildcard.

Suggested patch: determine each supported representation's quality using its most specific matching range first (including zero), then choose the highest-quality allowed representation. Keep server preference as the tie-breaker. Add tests for exact `q=0` plus `*/*`, subtype `q=0` plus `*/*`, and an exact positive quality overriding a less specific zero.

Local workaround in [meta-sovereign PR 57](https://github.com/link-foundation/meta-sovereign/pull/57): use the public `parseAccept` function to compute per-representation quality before calling the public negotiator with explicit supported candidates.
