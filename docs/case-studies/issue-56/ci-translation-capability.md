# Keep browser-independent translation capability in the contract

[Parent run 43269083327](https://github.com/link-foundation/meta-sovereign/actions/runs/43269083327)
started at 2026-11-12 17:24:23 UTC for exact commit
`d4c7fb8122d3e708e584749a25a8ed5d63449bc0`. Seven completed runtime jobs fail
the same capability assertion. The service now exposes private translation
comparison independently of browser availability; the older exact expected
object omitted `cvTranslation: true`.

The archived Ubuntu Node log, job 131362601378, lines 6472–6498 identifies
`vacancy-search.test.js:299` and the sole additional field. The corresponding
Windows Node failure is at lines 8048–8075, Ubuntu Bun at 5484–5549, macOS Bun
at 4778–4826, Ubuntu Deno at 8312–8337 and Windows Bun at 9717–9765. All seven
raw job logs, exact-head job metadata and focused before/after logs are in the
[checksummed archive](data/ci-translation-capability.tar.gz).

The existing focused test fails locally before the expected field is added and
passes afterward in Node and Deno. It still requires search, export, native Save
watch and apply to be unavailable without a browser. Production behavior and
capability checks remain unchanged.

```sh
node --test --test-concurrency=1 --test-timeout=10000 \
  --test-name-pattern='capabilities report missing browser support' \
  js/tests/vacancy-search.test.js
deno test --allow-all --no-check \
  --filter='capabilities report missing browser support' \
  js/tests/vacancy-search.test.js
python3 -B experiments/issue-56/collect-translation-capability-ci.py
```

Windows Deno shard 3 has another failure: `rolling-cli` cannot find its private
control pipe within its existing ten-second startup budget (lines 5106–5122).
Its child output, lines 2260–2299, shows dependency downloads/initialization
before CLI import readiness. That separate startup investigation remains open;
this expectation correction does not make all hosted checks pass.

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft
and unmerged. Exact new-head CI and every unchecked original feature criterion
remain required.
