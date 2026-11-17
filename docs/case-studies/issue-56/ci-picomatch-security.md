# Strict dependency audit and repeated-extglob repair

At published source `d3513d3988c276838c180809a06426af20f5d263`, all five
workflows started at 2026-11-17 18:52:50 UTC. Desktop, Pages and link checks
passed. [Checks and release](https://github.com/link-foundation/meta-sovereign/actions/runs/44152566961)
and [Scheduled security audit](https://github.com/link-foundation/meta-sovereign/actions/runs/44152566977)
failed; their dependent summaries also failed. These are actual failures,
not stale checks from an earlier commit.

## Reproduction and cause

The preserved `d3513d39-audit-failed.log` identifies picomatch at lines 299–302
and reports 21 high findings at line 379. The scheduled security log contains
the same advisory at lines 291–293 and the total at line 371. The independent
format log names `reference-feature-inventory.md` at line 547 and exits at
line 549; the preceding person opt-out commit formats that table.

[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) affects
the latest npm picomatch, 4.0.7, with no official patched release on the review
date, 2026-11-17. A repeated single wildcard branch such as `+(*)c` produces
nested unbounded regular-expression quantifiers. The parent regression fails
on the generated expression without executing a hostile unpatched match.

The reviewed upstream candidate alone retains version 4.0.7, so a version-only
registry audit still reports it. The npm suggested forced downgrade does not
provide a patched picomatch. Neither route resolves the source defect and audit
requirements together.

## Change and provenance

The [private fork](../../../vendor/picomatch/README.md) applies only the parser
patch reviewed at upstream PR 254 commit
`c63a5bf4e61dbdb81bc41e97dc2616c30acce337` over the exact npm 4.0.7 tarball.
Unrelated differences in that PR's base are excluded. Seven runtime files,
package metadata and the original MIT license have before/after hashes. The
generator checks the original tarball digest and independently reads back all
nine packaged entries. Its output is reproducible.

The explicit private identity `meta-sovereign-picomatch@4.0.7+patched.1` retains
the upstream version and source provenance. The root dependency override is
locked to the committed artifact. Strict registry audit remains unchanged and
passes with zero findings for the resulting graph. Registry audit cannot
assess this private source; mandatory behavior and installed-file hash checks
cover the patch separately. No advisory waiver or threshold change is added.

Deno's installer skips local tarball dependencies. Deno now uses the shared
`npm ci` installation and manual node_modules resolution, including the same
reviewed native install scripts. Existing Deno partitions, type checking,
assertions and deadlines remain. A focused fixture initially exposed missing
Node type declarations; adding the declarations already present in the real
application lockfile fixes that fixture while retaining type checking. Bun's
installer resolves the override directly. Desktop staging also retains the
direct override reference and exact local artifact after development tools
are omitted. Two pre-fix regressions demonstrate the missing reference and
missing artifact; the repaired isolated stage survives deletion of its fixture
source checkout. Hosted installers still provide platform packaging verification.

## Focused verification

Run the relevant checks with one worker:

```sh
node --test --test-concurrency=1 --test-timeout=30000 js/tests/picomatch-security.test.js js/tests/ci-deno-shards.test.js js/tests/ci-version-lock.test.js js/tests/desktop-security-override.test.js js/tests/desktop-packaging.test.js
npm audit --package-lock-only --audit-level=low
node experiments/issue-56/picomatch-installation.mjs deno
node experiments/issue-56/picomatch-installation.mjs bun
```

The local focused run passes 31 checks; the existing native Deno partition
probe remains assigned to Deno CI. Each isolated five-package installation
passes the four security checks in its selected runtime. These verify ordinary
globs and extglobs, exact installed source hashes and real tinyglobby discovery.
The finite hostile-input child has a 32 MiB V8 heap, 256 KiB stack and two-second
kill deadline. No hostile unpatched execution or full local matrix is run.

Source-bound logs, original failing workflow logs, reviewed upstream responses,
the released tarball and the final fork are preserved in
[`data/ci-picomatch-security.tar.gz`](data/ci-picomatch-security.tar.gz), with an
independently checked [SHA-256 manifest](data/ci-picomatch-security.tar.sha256.json).
Exact-source hosted verification is pending publication. This CI repair accepts
no new original feature criterion: **83 accepted, 35 unfinished**. PR57 remains
draft and unmerged; every unfinished criterion is still required.
