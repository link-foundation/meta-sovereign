Confirmed again on 2026-10-28 while investigating https://github.com/link-foundation/meta-sovereign/pull/44. `electron-builder@26.18.0` with Node 24/npm 11 still produces four registry deprecations on a clean `npm ci --no-audit --no-fund`.

Reproduction in an empty temporary directory (no application build needed):

```sh
npm init -y
npm install --save-dev --save-exact electron-builder@26.18.0 --ignore-scripts --no-audit --no-fund
npm ls boolean glob inflight rimraf
```

Dependency chains in the committed lockfile:

- `app-builder-lib -> @electron/asar@3.4.1 / @electron/universal@2.0.3 -> glob@7.2.3 -> inflight@1.0.6`
- `electron-builder-squirrel-windows -> electron-winstaller@5.4.0 -> temp@0.9.4 -> rimraf@2.6.3 -> glob@7.2.3`
- `app-builder-lib -> @electron/get@3.1.0 -> global-agent@3 -> roarr@2 -> boolean@3.2.0`

The published `26.18.1` manifests retain these chains. In contrast, resolving exactly `27.0.0-alpha.13` into our package lock removes all four deprecated entries and the old `electron-winstaller`. This agrees with the maintainer's explanation above. We are testing that pinned prerelease on native Linux x64/arm64, macOS x64/arm64 and Windows x64 packaging in CI; lockfile resolution alone does not prove packaging compatibility.

Workarounds: pin the v27 prerelease only after validating the application's actual packaging targets, or retain 26.x with its warnings visible until a compatible stable/backported fix is available. Suppressing npm warnings does not fix the tree. Blind major-version overrides are unsafe: `temp@0.9.4` calls the old callable/callback `rimraf` API and `@electron/asar@4` changes module/runtime requirements.

Suggested upstream solution: release the completed v27 migrations to asar 4/universal 3/get 5 and the rewritten Squirrel builder, or backport compatible adapters to the 26.x line. Add a clean-install dependency-tree assertion for deprecated registry entries plus native packaging smoke coverage for supported targets. Consider keeping the Squirrel-only toolchain optional for NSIS consumers.
