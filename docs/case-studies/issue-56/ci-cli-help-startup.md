# CLI help admission without provider imports

Windows Deno shard 1, job `132483826503` in run `43606682331`, failed on
published `cd2a3337fa7222f924e4b55c60b3503fabd8dacd` at the existing ten-second
unsuccessful-CLI test deadline. Complete job lines 3551–3557 show the child
logging entrypoint import after eight milliseconds, but neither ordinary-command
readiness nor help output. Lines 5181–5195 record the timeout and aggregate
1,839 passing cases, one failure and four ignored cases. The full 147,661-line
workflow, 5,230-line job, dependent pipeline log and annotations were downloaded.
Other runtime jobs, all eight browser lanes and four companion workflows pass.

The observed code path imports the entire ordinary-command/provider graph before
it determines that a command is unknown and only prints usage. That unnecessary
dependency is reproducible independently of the hosted delay. The existing local
Node output test passes on the parent; the Windows import stall itself is not
reproduced locally and no particular provider/module is identified as its cause.

## Change

All existing help constants now live in one pure text module. Their original
subcommand exports remain available, and the root usage output is byte-identical.
Help aliases and unknown-command explanations load that module directly. A small
admission catalog covers all 116 ordinary command registrations; a regression
compares it with the actual assembled factory registrations so adding a command
cannot silently make it unreachable. Registered commands still use the original
executor and error/store handling. Version and serve keep their existing separate
consumers. Unknown commands retain failure status and print help without parsing
their flags; inherited object-property names also receive the ordinary unknown
command response.

The existing default-off, payload-free lifecycle trace now identifies help
readiness separately. Child output still drains through the actual entrypoint,
and its two tests retain the ten-second deadline. Test and CI deadlines, runtime
matrices and command behavior are not relaxed.

## Reproduction and verification

Run `PYTHONDONTWRITEBYTECODE=1 python3 experiments/issue-56/cli-help-before.py`.
The exact published parent `fffdc0b2a8a3f91e66eba445e0a6a7dbd3285414` (whose CLI
matches the failed head) fails the new import-boundary regression. The runner
restores working production sources and awaits its owned child. No browser,
provider action or build is involved.

`node experiments/issue-56/cli-help-imports.mjs` observes actual Node imports for
no arguments, help, both aliases and one unknown command. The retained parent
observation loads 793 source modules, including providers, assignments and jobs;
the corrected observation loads nine. Both return `[0,0,0,0,1]` and all five
output hashes match exactly. Individual observed elapsed times/RSS are retained
as diagnostic measurements, not a cross-platform benchmark or a guarantee about
the original Windows delay.

The focused Node group passes 16 checks, including real delayed output, command
catalog completeness, aliases, existing import/export/source commands,
broadcast/search, profile/résumé, audience, and independent version/serve import
boundaries. Deno passes 13 with three Node-load-hook checks explicitly ignored;
it runs the catalog, behavior and actual-entrypoint output checks. Run only:

`node --test --test-concurrency=1 js/tests/cli-help-imports.test.js
js/tests/cli-output.test.js js/tests/cli-startup-imports.test.js
js/tests/cli.test.js js/tests/cli-iter3.test.js`.

The same files run through `deno test --cached-only --no-check --allow-all`.
Broad runtime/browser checks remain in hosted CI. Scoped strict lint, formatting,
secrets, whitespace and the unchanged duplication threshold are required before
publication. The [checksummed evidence](data/ci-cli-help-startup.tar.gz) includes
the exact-parent source snapshots, observed module lists, all focused results,
original failed job and annotations. Fresh exact-head Windows results are still
required; passing local checks do not establish the hosted stall's cause.

This supports [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
All 81 original incomplete inventory rows remain required; the PR stays draft
and unmerged.
