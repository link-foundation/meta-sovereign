Further testing found a compatible published workaround for the separate updater warning: scope an exact alias to the updater's dependency only:

```json
{
  "dependencies": { "electron-updater": "6.8.12" },
  "overrides": {
    "electron-updater": {
      "lodash.isequal": "npm:lodash.isequalwith@4.4.0"
    }
  }
}
```

`isEqualWith` without a customizer preserves the two-argument boolean comparison used by `DownloadedUpdateHelper`. This avoids the unsafe alias to the whole lodash default export. A clean isolated install has no deprecated entries and npm audit reports zero vulnerabilities. We also tested the **actual installed DownloadedUpdateHelper**: cloned metadata reuses an existing download; changed version/checksum/release notes/file info and missing files reject it. Optional undefined, NaN, signed zero and array-order cases are included.

Reproduction/check script: https://github.com/link-foundation/meta-sovereign/blob/issue-43-1924384484c0/experiments/issue43-updater-alias.mjs . Each real staged desktop installation also runs https://github.com/link-foundation/meta-sovereign/blob/issue-43-1924384484c0/js/scripts/validate-desktop-updater.mjs . The earlier report and published-version evidence remain valid; this follow-up replaces the earlier recommendation to retain the warning while waiting.

An upstream replacement plus equivalent cache regression tests remains preferable, so consumers can remove this scoped compatibility override.
