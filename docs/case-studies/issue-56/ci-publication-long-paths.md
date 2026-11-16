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
refusing operation. The original logs alone cannot establish the Windows cause.
The later native comparison below witnesses the long-path refusal and its correction.

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
verification; no inventory row is accepted by this correction.

## Native Windows receipts

Published `9d31c3e7` main run
[43944951085](https://github.com/link-foundation/meta-sovereign/actions/runs/43944951085)
now passes all formerly failing experience-publication checks on Node, Deno and
Bun. Each runtime also runs the explicit 321-character comparison: disabling
long paths produces native `Filename too long`, an uncertain receipt and zero
pushes; the corrected command publishes once with repository configuration
unchanged. The comparison establishes this native path-limit failure and its
correction. The original job's precise refused Git operation remains unwitnessed;
the counterfactual diagnostic reports only `other` rather than naming it.

- Node shard 2 job `133576614147`, lines 1079–1081, records both native states;
  line 3859 reports zero failures. Shard 3 job `133576613964`, lines 1043–1047,
  passes the four original experience checks; line 3960 reports zero failures.
- Deno shard 1 job `133576614241`, lines 4180–4186, records both native states;
  line 5916 reports 2,185 passing and zero failing tests.
- Bun job `133576613983`, lines 2885–2887, records both native states;
  lines 13446–13448 report 6,916 passing and zero failing tests.

All four complete positive logs are retained alongside the three original raw
failures. A separate [browser locator correction](ci-publication-panels.md)
is required for the new publication panel. The next published source still
requires a fresh successful five-workflow gate before criterion acceptance.

The full issue scope remains active in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
