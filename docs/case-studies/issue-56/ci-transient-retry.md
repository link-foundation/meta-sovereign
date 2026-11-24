# Restore native HTTP retries in link validation

Exact-head run [44171573167](https://github.com/link-foundation/meta-sovereign/actions/runs/44171573167)
on `2769b823` still failed after host pacing. Its preserved raw log has the
14-error summary at line 521 and the failed entries at lines 528–554: eleven
unique GitHub source URLs returned HTTP 503. Both existing native pacing and
strict-failure controls passed. This is a distinct remaining checker defect;
pacing alone did not resolve hosted validation.

The stable lychee 0.24.2 used by action 2.9.0 wraps rejected responses as
`ErrorKind::RejectedStatusCode`. That path retries only HTTP 429, bypassing the
existing status-code policy for 408 and 5xx. Consequently, configuring three
retries did not retry the hosted 503 responses. The upstream maintainers already
confirmed and corrected this in [issue 2319](https://github.com/lycheeverse/lychee/issues/2319)
and [merged PR 2324](https://github.com/lycheeverse/lychee/pull/2324).

The workflow now selects the official nightly containing that correction through
the existing versioned action. Its six native retry controls are mandatory on
every link-check run. The same host pacing, global concurrency of four, three
retries, two-second retry interval, thirty-second request timeout, ten-minute job
deadline, exclusions and strict final failure remain. Permanent failures still
fail; archived pages remain repair suggestions.

Reproduce the stable defect and verify the corrected binary:

```sh
python3 -B experiments/issue-56/lychee-transient-retry.py /path/to/lychee
```

The fixture writes an actual Markdown link for the checker to validate. An early
probe mistakenly supplied the HTTP URL as the checker's input document; that
failed-input experiment is preserved separately and is not retry evidence.

Stable 0.24.2 has **four failures and two positive passes** in six checks. The
corrected nightly passes all six: 408/500/503 followed by HTTP 200 recover after
exactly two requests; a persistent 503 exhausts exactly three requests; zero
retries and permanent 404 each fail after one request. Fixtures bind loopback,
use one native worker, bound each process and drain their owned HTTP servers.
The four unchanged host-pacing/permanent-failure checks also pass on the nightly.
All eleven previously failed source URLs pass one finite real native recheck.
These rechecks establish current reachability, not hosted acceptance or proof of
the remote service's original cause.

The tested official nightly was published 2026-11-13; its current source tag is
`f10ac2774dac100dfdbf014647487520a8ffe08d`. The downloaded Linux x86-64 asset is
7,762,645 bytes with SHA-256
`320b6cd1e624d3d421fe3481b39427689e20b6ad65a2e3171fa0b7e19ac7a82e`, checked
against the GitHub release asset metadata before extraction. Stable and nightly
both print `lychee 0.24.2`; native behavior and artifact provenance distinguish
them. No local source build or dependency installation was needed.

`nightly` follows upstream updates; the existing action version stays unchanged.
The mandatory behavioral controls protect recovery and strict-failure semantics
on subsequent downloads. The archive retains version/tag/asset provenance,
upstream issue and correction, exact failed logs, fixture sources and all scoped
verification results without storing executables.

Exact-source hosted verification and every original issue requirement remain
required. **83 of 118 criteria are accepted; 35 remain unfinished.**
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) stays draft and
unmerged.

Evidence: [archive](data/lychee-transient.tar.gz),
[hash manifest](data/lychee-transient.tar.sha256.json).
