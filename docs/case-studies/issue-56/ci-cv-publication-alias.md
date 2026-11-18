# Canonical publication paths in the control fixture

Checks run `43649013601` belongs to published commit
`745766488c2c1c6e1773546d9d0a4175a8b28aa0`, created
2026-11-14T22:36:51Z. Four downloaded failing runtime jobs have the same
new native-export control assertion: Windows Deno job `132613956347`,
lines 5258–5295; Windows Node job `132613956401`, lines 3280–3328;
Windows Bun job `132613956381`, lines 2590–2610; macOS Bun job
`132613956443`, lines 821–842. These are actual downloaded errors,
not an inference from the aggregate status. Full logs are retained with
the [desktop landing evidence](desktop-landing-availability.md).

The fixture rendered the original temporary repository path, while the
review receipt contains its canonical real path. Windows expands
`RUNNER~1`; macOS resolves `/var` to `/private/var`. The panel correctly
disabled confirmation for those different strings. Production
`useCvPublication.plan` already replaces the entered path with the
returned canonical path. The test now models that state, preserves all
four-language/source/slot assertions and adds explicit changed-target
refusal. Production path guards, consent and expiry remain unchanged.

Run `python3 -B experiments/issue-56/cv-publication-alias-path.py --before`
to reproduce the exact parent test through an owned temporary symlink on
Linux. It fails one filtered check and restores the current test in
`finally`. Without `--before`, the same aliased-path check passes. A
focused Deno control check also passes. The probe removes its owned
directories and uses no provider, browser or external Git remote.

This corrects a fixture mismatch. Exact-head hosted matrices and every
unfinished issue requirement remain required; PR #57 stays draft.
