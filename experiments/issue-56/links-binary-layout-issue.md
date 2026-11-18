## Observed behavior

On published JavaScript `links-notation@0.31.6`, the default `BinaryLinoCodec` uses unary scalar references and doublet-only linked character lists. This is a valid associative representation, but it is costly for ordinary object transport. A finite 101-record synthetic document produces 33,699 bytes and encodes in 298.7 ms locally. The existing external-reference/variable-arity mode preserves the exact document, produces 17,775 bytes and encodes in 36.6 ms on the same process. Times describe this observation, not a portable timing guarantee.

In meta-sovereign a larger complete 101-description object corpus produces 34,544 links/138,180 bytes using defaults and 2,204 links/81,311 bytes with external variable arity. A real macOS Node integration test exceeded its unchanged ten-second deadline with the default layout. Local phase measurements locate most binary work in encoding; they cannot establish every source of hosted scheduler latency. The affected draft is https://github.com/link-foundation/meta-sovereign/pull/57.

## Finite reproduction

Install `links-notation@0.31.6`, save as `reproduce.mjs`, and run `node --max-old-space-size=192 --stack-size=1024 reproduce.mjs`. It uses 101 records, no network or stress loops and checks exact document round trips.

The exact script is [links-binary-layout-upstream.mjs](links-binary-layout-upstream.mjs). The published [upstream report](https://github.com/link-foundation/links-notation/issues/420) includes that self-contained source.

## Workaround

Use the already supported options `new BinaryLinoOptions(true, new ArityRange(2, null))` for object transport, retaining explicit finite `DecodeLimits`. Existing readers accept both layouts because the packet declares its references and section arities. Keep doublet-only encoding when that graph representation is required.

## Suggested improvement

Document an object-transport preset alongside the pure-doublet default, with size/round-trip vectors and the tradeoff between graph shape and transport cost. Consider avoiding all 64 bit tests in `Encoder.unary` for small code points (start at the highest set bit or cache their immutable scalar references), retaining byte-identical output in the pure-doublet mode. Add a finite benchmark for Unicode prose and multiple records. This report does not request changing the associative default or weakening decoder limits.
