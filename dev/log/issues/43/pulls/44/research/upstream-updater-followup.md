Follow-up: the v27 **builder** dependency tree resolves the four chains above, but a separately staged desktop application still emits:

```
npm warn deprecated lodash.isequal@4.5.0: This package is deprecated. Use require('node:util').isDeepStrictEqual instead.
```

Minimal reproduction (no Electron download or native build):

```sh
mkdir updater-repro && cd updater-repro
npm init -y
npm install --ignore-scripts --no-audit --no-fund electron-updater@6.8.12
npm ls lodash.isequal
npm view electron-updater@7.0.0-alpha.12 dependencies --json
```

As of 2026-10-28 the published v26 updater 6.8.12 and next 7.0.0-alpha.12 both directly require `lodash.isequal: ^4.5.0`. `DownloadedUpdateHelper.ts` imports it to compare cached `UpdateInfo` and `fileInfo.info` before reusing a download. CI evidence: https://github.com/link-foundation/meta-sovereign/actions/runs/40701906023/job/122863906895 (installation warning before the independent v27 schema migration error).

Workaround: retain the current updater with the warning visible until a compatible replacement is released. Upgrading only electron-builder, or upgrading to the current updater next tag, does not remove this separate dependency. Replacing the default import with the entire `lodash` package via an npm alias is unsafe: lodash's default function returns a wrapper rather than a comparison boolean. Removing the updater would remove application functionality.

Suggested code fix: evaluate `isDeepStrictEqual` from `node:util` for these JSON/YAML update metadata comparisons, or a maintained comparator with the required semantics, then remove lodash.isequal and its type dependency. Add tests for equal/cloned metadata, changed checksum/version, optional fields, arrays, and prototype distinctions before choosing strict native equality. Backport a compatible fix to updater 6, or publish the fixed updater 7 with its runtime migration guide. A clean install assertion should cover the shipped updater dependency tree as well as the builder's devDependencies.
