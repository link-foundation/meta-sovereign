# Private picomatch security fork

The private `meta-sovereign-picomatch@4.0.7+patched.1` archive supplies the
`picomatch` dependency through the root override. It contains the seven runtime
files, package metadata and original MIT license from npm 4.0.7, with one
reviewed parser patch from
[upstream PR 254](https://github.com/micromatch/picomatch/pull/254), pinned to
`c63a5bf4e61dbdb81bc41e97dc2616c30acce337`. No other changes from that PR's base
are included. This is a private fork, not an official upstream release.

[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) affects
the latest published upstream version, 4.0.7, and has no patched release as of
2026-11-17. Repeated single wildcard branches can compile nested unbounded
quantifiers. The included [security patch](security.patch) removes the outer
repeat when the parsed branch language absorbs concatenation, preserving
ordinary matching. Alternatives, nested constructs and the explicit safeguard
opt-out retain their previous behavior. With `capture: true`, an inner wildcard
capture covers the flattened body rather than the final repeated iteration;
the outer capture remains the full match. Application consumers use matching,
not these inner captures.

The registry's version-only audit still reports the reviewed upstream commit as
4.0.7. The local fork has a distinct, explicit package identity and retains the
upstream version in its provenance. Registry audit remains strict for registry
dependencies; it cannot assess private source changes. Mandatory focused tests
verify the installed fork's matching behavior and bounded hostile-input
completion. No advisory is ignored and no audit threshold is relaxed.

Deno uses `nodeModulesDir: "manual"` and the shared `npm ci` installation,
including the reviewed native install scripts. Its own installer does not
support local tarball dependencies. Bun installs the same override with
`bun install`. Desktop staging includes the direct reference and local archive
so its independent production installation resolves the same override.
The focused installation experiment exercises only picomatch,
tinyglobby, fdir and Node type declarations, then runs the four security checks
in the selected runtime:

```sh
node experiments/issue-56/picomatch-installation.mjs deno
node experiments/issue-56/picomatch-installation.mjs bun
```

The [provenance manifest](provenance.json) records every original and patched
file hash, the npm tarball digest and the fork archive digest. The generator
requires the exact npm tarball digest and rewrites only the parser and package
metadata. Reproduce it without installing dependencies:

```sh
curl -fsSL https://registry.npmjs.org/picomatch/-/picomatch-4.0.7.tgz -o /tmp/picomatch-4.0.7.tgz
python3 -B experiments/issue-56/package-picomatch-fork.py /tmp/picomatch-4.0.7.tgz
```

Replace this override with a verified official patched release when available;
retain the security regressions. The fork has no dependency or install script.
