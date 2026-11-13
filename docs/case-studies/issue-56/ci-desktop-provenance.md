# Desktop provenance metadata

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), issue #56.

Desktop run `43492615795` belongs to published commit
`0f245481b247bdbbf622127deecd97fd095ddb8e`, created
2026-11-13T19:29:01Z. Its Windows ARM64 job built both installers and passed
the size/shape smoke test. The next step launches
`npx --no-install electron-builder --version`. The complete downloaded workflow
log records the launch at lines 3033–3034 and process exit `-2147483644` at
line 3035. No checksum or provenance output follows. The other four packaging
jobs pass. This failure is separate from the preceding WebKit disclosure failure.

Provenance now reads the installed `electron-builder/package.json` version with
Node, avoiding another packaging CLI invocation solely to obtain metadata. It
continues to hash the built files, omit blockmaps, and record the source,
runner, Node and Electron versions. No packaging or smoke assertion changes.
The hosted process exit alone does not identify a deeper Node/npm/ARM64 cause;
this change removes that unnecessary process from the failed step.

`node experiments/issue-56/desktop-provenance-version.mjs --before` runs the
actual shell step from that exact parent with an unavailable npm launcher and
fails with exit 86. Omitting `--before` passes the same finite fixture and
checks generated checksums and provenance. The Linux x64 packaging job also
runs this regression; the actual Windows ARM64 packaging result still needs
verification on the corrected published commit.

The [evidence archive](data/ci-desktop-provenance.tar.gz) and
[hash manifest](data/ci-desktop-provenance.tar.sha256.json) preserve the full
5,180-line hosted log, run/job metadata, exact-parent workflow, reproducer and
focused validation logs. Native durable admission and the remaining original
issue requirements stay active; the pull request remains draft and unmerged.
