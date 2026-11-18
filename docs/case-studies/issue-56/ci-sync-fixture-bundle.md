# Await the actual sync fixture bundle before navigation

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft.
Published `d6841cad` fails WebKit shell shard 1 in
[job 132701426190](https://github.com/link-foundation/meta-sovereign/actions/runs/43677439888/job/132701426190).
Complete log lines 718–746 show an unhandled `route.fetch: read ECONNRESET`
request for the fixture's actual `/app.min.js`, originating at
`e2e-sync-peer.mjs:14`. The log does not identify why that connection reset.

The WebKit fixture needs native mock capture before the app starts so its
native RTC peers can exchange usable candidates. Previously an asynchronous
navigation request callback fetched the upstream bundle, then prefixed the
existing capture initialization. An upstream rejection escaped the awaited
peer setup and terminated Node. The new helper awaits that same server bundle
before navigation, validates a successful JavaScript response and bounds it to
16 MiB. The navigation hook only fulfills the actual prefetched bytes with the
same capture prefix. Transport failures still reject preparation; there are no
retries, replacement app code or swallowed fetch errors.

The regression reproduces the captured reset against the exact published
helper, then verifies one pre-navigation fetch and the actual bundle content.
Two other cases retain transport errors and reject failed, HTML, empty and
oversized responses. All three pass in Node and Deno. Reproduce with:

```sh
python3 -B experiments/issue-56/sync-fixture-bundle-parent.py
node --test --test-concurrency=1 js/tests/sync-fixture-bundle.test.js
```

One rebuilt native WebKit run executes only the affected shell scenario:
two owned browser contexts converge writes over actual signaling, native RTC
and persistence. Mock capture ends, owned resources close and there are no
page exceptions or live provider sessions. The existing convergence
assertions and deadlines remain unchanged. The normal mandatory shell/sync
entries exercise this shared helper in hosted CI; no local matrix was run.

[Checked source and log archive](data/ci-sync-fixture-bundle.tar.gz) and
[manifest](data/ci-sync-fixture-bundle.tar.sha256.json) retain the actual parent,
complete hosted failure, finite reproduction and native/focused results.
Exact corrected-head CI and every unfinished original criterion remain required.
