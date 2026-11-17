# Desktop packaging contract (VD09)

The pinned desktop requirements are
[`docs/REQUIREMENTS.md` at `8fbf3b7c`](https://github.com/konard/vk-bot-desktop/blob/8fbf3b7c42fd8e995ef137cab9b9653a7dc9b1a1/docs/REQUIREMENTS.md).
VD09 covers distribution, installation and operation without a developer
account. Runner execution, action configuration and mode switching remain
separate criteria. The source selected for this review is `06953e31`.

| Required behavior                                                                                           | Current implementation                                                                                                                                                                                                                                                                                                                      | Verification                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build downloadable native desktop packages for all available architectures.                                 | `desktop-release.yml` has five native jobs: Linux x64/ARM64, Windows x64/ARM64 and macOS ARM64 packaging both Mac architectures. `prepare-desktop.mjs` stages the server, production provider dependencies and bundled UI.                                                                                                                  | Current hosted artifacts contain fourteen installers/archives: Linux AppImage/deb/tar.gz, Mac DMG/ZIP and Windows installer/portable, each for x64 and ARM64. Nineteen portable packaging checks verify versions, names, dependencies and complete release assets.                |
| Run the Mac app without an Apple Developer account.                                                         | Pull requests and missing-secret releases select ad hoc signing explicitly, including identity `-`, the local signing hook and disabled notarization. The hook deeply signs the bundle and fails if strict verification fails.                                                                                                              | Both app bundles and both mounted disk images pass `codesign` verification. A native ARM64 packaged window starts its healthy backend and exits cleanly. This is ad hoc signing, not Apple notarization.                                                                          |
| Verify installation and actual launch on the target platform.                                               | Linux extracts its AppImage into runner-owned storage. Windows silently installs into a unique owned directory, samples for unwanted launch, explicitly starts it afterward and uninstalls. The shared launch probe uses an isolated profile/store and requires a real visible protected window, healthy Lino backend and drained shutdown. | Five current native receipts and screenshots. Both Windows receipts confirm silent installation without automatic launch and completed owned cleanup. The Mac runner launches its native ARM64 binary; it does not claim an Intel-native launch.                                  |
| Keep package, release, update-feed and download names consistent.                                           | Builder configuration and normalization use the common download catalog, root package version and updater-compatible metadata. A changeset is already present for the next release.                                                                                                                                                         | Portable name/feed/release validation and the installed builder metadata test pass. Actual package metadata carries version `1.2.0`.                                                                                                                                              |
| Provide checksums and build provenance, with attestations where available.                                  | Build jobs write SHA-256 records plus runner, exact commit, Electron, builder, Node, signing mode and file inventory. Publishing combines and verifies hashes, adds repository/workflow/tag provenance and attests the installer files.                                                                                                     | Bounded authenticated artifact reads retain all five checksum/provenance pairs and ZIP catalogs. Fourteen unique checksum records cover exactly the fourteen package files. This validates recorded metadata and ZIP CRCs; it does not independently hash large installer bodies. |
| Gate releases on tests and support same-version retry/manual publication without incomplete downloads.      | Desktop release resolves the validated source through the shared release gate. Pull requests build without publishing. Main/tag/manual paths use the same packaging implementation; publication validates all assets and uploads the completion checksum last. An already complete release is skipped.                                      | Current PR publication intentionally skips. Existing release-gate and asset tests exercise successful validation, rejected/cancelled upstream checks, version-only source differences and missing package/checksum refusal. No release is published from this PR review.          |
| Explain unsigned first launch, architecture choice and verification in the README, landing page and guides. | English/Russian READMEs and four guides explain checksum-first, per-app Mac Gatekeeper exceptions and scoped `xattr`; the landing page offers the same two alternatives and local checksum verification. Guides cover Linux archive/AppImage/deb, Windows installer/portable, ARM64 manual updates and provenance.                          | Current source review confirms the native commands and guidance. Existing download-page native and portable coverage remains associated with VD10.                                                                                                                                |

The reference's single-workflow release orchestration is implemented here by
the existing Checks/release workflow and its gated Desktop release consumer.
The required behavior is the same validated source and version reaching
packaging/publication, with no publishing after failed or cancelled validation.
The separate workflow also permits package validation on pull requests without
release credentials. It does not turn a skipped or failed desktop build into a
successful published download.

## Current receipts and limits

[Desktop run 44093457458](https://github.com/link-foundation/meta-sovereign/actions/runs/44093457458)
passes all five build jobs. Each records one visible packaged window,
`contextIsolation: true`, `nodeIntegration: false`, `backendReady: true`,
`cleanExit: true` and `runtimeDrained: true`. No live provider is used.
The packaged updater reports a missing release-channel file on this unpublished
PR build; a successful launch receipt does not assert a clean updater console
or a published update.

The package provenance names synthetic merge `001085fc`. Its parents are
default `1dc57835` and selected head `06953e31`; its tree exactly equals the
selected head tree. Five bounded metadata reads transfer **5,560 bytes** in
total. Large installers are neither downloaded nor executed on the user's
machine. Native execution remains on the hosted target runners.

The collector requires all five successful workflows at the selected source,
25 named portable packaging/launch/cleanup checks, all five semantic native
receipts and screenshots, the four Mac signature checks, matching artifact
identities and the exact merge-tree mapping:

```sh
python -B experiments/issue-56/collect-desktop-packaging-hosted.py 06953e31 06953e31
```

It retains a checked archive with `acceptance: false`: integrity checks support
the contract review rather than replacing it. Full current-source hosted
verification is still pending; VD09 stays unchecked until that succeeds.
Every other unfinished requirement remains active in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
