# Portable salary fixture dependency

At source `ed68e6658a590e4bd0c2195de14605ce5ce5fc6f`, the
[Windows Deno shard](https://github.com/link-foundation/meta-sovereign/actions/runs/44078626577/job/134025884342)
fails before running tests. Preserved job log lines 3121–3126 identify TS2307:
`browser-commander` cannot be resolved from `salary-vacancy-browser-fixture.mjs`.
The portable vacancy-card regression imports two constants from a module that
also mounts browser DOM. That module statically imports the real browser reader,
which loads an optional npm dependency unavailable to this Deno test graph.

The unchanged focused command reproduces the same type-check error locally:

```sh
deno test --v8-flags=--max-old-space-size=384 --allow-all \
  --filter 'observed HH vacancy card currency' \
  js/tests/salary-browser-vacancy-card.test.js
```

The constants now live with the other dependency-free salary vacancy fixture
data. The portable test imports them there; the DOM helper re-exports the same
names for its existing browser callers. Browser reader behavior, native
assertions, optional dependency declarations and CI type checking remain intact.
All six existing vacancy-card tests pass in both Deno and Node. The mandatory
native card scenario also passes with zero vacancy-page reads, zero text sends,
preserved owner drafts/rules and closed fixtures.

The [checked archive](data/ci-salary-fixture-import.tar.gz) preserves the exact
hosted failure, local reproduction, focused checks and changed source bytes.
Current hosted verification and all forty original unchecked criteria remain
required in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
