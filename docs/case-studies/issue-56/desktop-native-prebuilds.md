# SQLite prebuilds in desktop installers

Desktop run [43811953283](https://github.com/link-foundation/meta-sovereign/actions/runs/43811953283)
started on 2026-11-16 at 05:42:12 UTC for published commit `83fea0ee`.
All five packaging jobs failed. Adding the required browser runtime also adds
better-sqlite3, whose package ships flat `.node` filenames for several operating
systems and architectures. Staging correctly installs the dependency, but the
existing package filters retain every binary. Builder 27's native verifier then
refuses foreign binaries in each installer.

The preserved full log records the Linux x64 error at lines 2555–2575, including
Mach-O, PE and arm64 files where ELF x64 is required. The Windows arm64 failure
at lines 3088–3106 reports the corresponding foreign binaries. Run metadata and
the exact full log are retained in the evidence archive.

Per-platform file exclusions now keep the architecture selected by the builder,
including glibc and musl variants on Linux. The builder applies them to both
hoisted and nested dependencies. Filtering does not mutate the shared staged
installation, so simultaneous architectures do not delete each other's files.
Provider JavaScript, portable WASM and unrelated addons remain available.
Native verification stays enabled and cross-platform native source rebuilds
remain disabled.

Seven new checks exercise the installed builder's actual dependency matcher and
native verifier. Against actual parent `fc968e1a`, all seven fail: foreign files
remain selected, and the native verifier reproduces the exact Linux x64 error.
The verifier fixture contains only eight 80-byte recognizable headers; none is
loaded or executed. After filtering it passes, and an unrelated mismatched
addon still fails verification. Existing packaging checks also remain intact.

Focused commands:

```sh
python -B experiments/issue-56/desktop-native-prebuilds-before.py
node --test --test-concurrency=1 --test-timeout=15000 js/tests/desktop-native-prebuilds.test.js js/tests/desktop-packaging.test.js
deno test --allow-read --allow-write --allow-env --allow-run --allow-sys --node-modules-dir=manual js/tests/desktop-native-prebuilds.test.js js/tests/desktop-packaging.test.js
```

All 26 focused checks pass in Node and Deno. Changed-file lint, formatting,
secret scanning and the unchanged duplication gate also pass. Full installer
builds and runtime validation remain hosted checks for the exact published head.
The wider VD01/VD09 requirements and all 60 unchecked inventory rows remain
unfinished in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

Evidence: [archive](data/desktop-native-prebuilds.tar.gz) and
[hash manifest](data/desktop-native-prebuilds.tar.sha256.json).

The next exact-head run, [43815507700](https://github.com/link-foundation/meta-sovereign/actions/runs/43815507700), verifies successful Linux x64/arm64 and Windows x64/arm64 builds. macOS passes native validation but fails later in DMG creation with `hdiutil: create failed - Resource busy` (preserved lines 4892–4966); that separate failure remains under investigation.

Checks run [43815507714](https://github.com/link-foundation/meta-sovereign/actions/runs/43815507714) exposes a clean-install Deno test-resolution error: `builder-util` is a transitive dependency, and Deno refuses its bare import from the root test. Linux log lines 4843–4852 and Windows lines 5904–5913 identify this exact import. The test now resolves the helper from its owning builder package with `createRequire`, like its other builder internals. All seven focused cases pass in Node and Deno. A previously populated local dependency graph had masked that clean-install distinction.

Follow-up evidence: [archive](data/desktop-prebuild-resolution.tar.gz) and [hash manifest](data/desktop-prebuild-resolution.tar.sha256.json).
