# Windows experience publication investigation

Published `bf15f7213436046f5b2897d045067c49542792e5` fails four experience
publication checks on Windows in main run
[43941245198](https://github.com/link-foundation/meta-sovereign/actions/runs/43941245198).
The complete raw logs are retained in the evidence archive:

- Deno job `133562828649`, lines 5930–5994: the foreground command returns 1;
  direct publication and both Lino transports return `uncertain` rather than
  `published`. The partition ends with 2,186 passing and four failing tests.
- Node job `133562828810`, lines 3626–3716: the same four assertions fail.
- Bun job `133562828672`, lines 2873–3016: the same four assertions fail; the
  final summary reports four failures at line 13594.

All four failures use the new immutable experience revision. Its filename
contains the complete 64-character source revision and 64-character public
content digest. The repository's absolute path can therefore exceed Windows'
legacy 260-character limit even when every filename is individually valid.
The original logs hide native Git stderr and do not establish the precise
refusing operation. Long-path handling is the current hypothesis, pending the
native comparison; a passing Linux test alone cannot establish the Windows cause.

## Scoped correction and bounded verification

The publication adapter now passes `-c core.longpaths=true` to its owned Git
commands. It preserves full source/content identities and does not mutate local
or global Git configuration. Consent, source validation, private files, unrelated
staged changes, isolated index, hooks, remote readback, uncertain outcomes and
non-replaying recovery retain their existing contracts.

`cv-publication-long-paths.test.js` publishes a full-revision snapshot with an
absolute path between 260 and 600 characters to an owned local bare repository.
The fixture deliberately keeps repository `core.longpaths=false` and verifies
that it remains false afterward. It checks exact remote bytes, unrelated staged
data and read-only recovery. On Windows it first runs an isolated counterfactual
with long paths disabled on each Git command, requiring an actual native
`Filename too long` refusal, no push and an unchanged remote. The corrected
comparison must publish once. Both fixtures close and remove their own resources.

An opt-in `CI_CV_PUBLICATION_DEBUG=1` trace records only the internal Git operation
and whether native stderr contains `Filename too long`. It never prints the
stderr, arguments, path, content or credentials. A second portable test verifies
that the trace is disabled by default and retains that private boundary.

The focused local checks pass: 22 Node tests, eight Deno tests, strict lint,
formatting and the unchanged duplication gate (6.49%, limit 6.5%). The Linux
long-path receipt is 286 characters with one acknowledged
local push and unchanged repository configuration. This is synthetic local
verification. Native Windows receipts and a fresh successful five-workflow gate
are still required; no inventory row is accepted by this correction.

The full issue scope remains active in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
