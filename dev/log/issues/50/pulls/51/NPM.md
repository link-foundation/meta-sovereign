# npm registry inventory

Live registry latest dist-tags captured on 2026-10-28. Includes every platform-specific, optional and nested root lock entry, plus a fresh lock-only resolution of all optional peers with the production desktop override. Before versions for previously unlocked peer transitives are marked new/tool; their parent ranges are recorded. The optional-peer snapshot and zero-vulnerability audit are in the evidence archive.

| Dependency | Before | After | Registry latest | Decision / parent constraints |
| --- | --- | --- | --- | --- |
| @aws-sdk/core | 3.978.6 | 3.978.7 | 3.978.7 | Current latest. |
| @aws-sdk/credential-provider-env | 3.972.77 | 3.972.78 | 3.972.78 | Current latest. |
| @aws-sdk/credential-provider-http | 3.972.79 | 3.972.80 | 3.972.80 | Current latest. |
| @aws-sdk/credential-provider-ini | 3.973.19 | 3.973.19 | 3.973.23 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. electron-publish: 3.973.19 |
| @aws-sdk/credential-provider-login | 3.972.84 | 3.972.85 | 3.972.85 | Current latest. |
| @aws-sdk/credential-provider-process | 3.972.77 | 3.972.78 | 3.972.78 | Current latest. |
| @aws-sdk/credential-provider-sso | 3.973.18 | 3.973.18 | 3.973.22 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @aws-sdk/credential-provider-ini: ^3.973.18; electron-publish: 3.973.18 |
| @aws-sdk/credential-provider-web-identity | 3.972.83 | 3.972.84 | 3.972.84 | Current latest. |
| @aws-sdk/nested-clients | 3.997.48, 3.997.51 | 3.997.48, 3.997.52 | 3.997.52 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @aws-sdk/credential-provider-ini: ^3.997.48; @aws-sdk/credential-provider-login: ^3.997.52; @aws-sdk/credential-provider-sso: ^3.997.48; @aws-sdk/credential-provider-web-identity: ^3.997.52; @aws-sdk/token-providers: ^3.997.48; electron-publish: 3.997.48 |
| @aws-sdk/signature-v4-multi-region | 3.996.49 | 3.996.50 | 3.996.50 | Current latest. |
| @aws-sdk/token-providers | 3.1150.0 | 3.1150.0 | 3.1159.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @aws-sdk/credential-provider-sso: 3.1150.0 |
| @aws-sdk/types | 3.975.0 | 3.975.0 | 3.975.0 | Current latest. |
| @aws-sdk/xml-builder | 3.972.41 | 3.972.42 | 3.972.42 | Current latest. |
| @aws/lambda-invoke-store | 0.3.0 | 0.3.0 | 0.3.0 | Current latest. |
| @azu/format-text | 1.0.2 | 1.0.2 | 1.0.2 | Current latest. |
| @azu/style-format | 1.0.1 | 1.0.1 | 1.0.1 | Current latest. |
| @babel/code-frame | 7.29.7 | 7.29.7 | 8.0.6 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. parse-json: ^7.26.2 |
| @babel/helper-validator-identifier | 7.29.7 | 7.29.7 | 8.0.6 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @babel/code-frame: ^7.29.7 |
| @cacheable/memory | 2.2.0 | 2.2.0 | 2.2.0 | Current latest. |
| @cacheable/utils | 2.5.0 | 2.5.0 | 2.5.0 | Current latest. |
| @capacitor/android | ^8.5.3 | 8.6.0 | 8.6.0 | Current latest. |
| @capacitor/cli | ^8.5.3 | 8.6.0 | 8.6.0 | Current latest. |
| @capacitor/core | ^8.5.3 | 8.6.0 | 8.6.0 | Current latest. |
| @capacitor/ios | ^8.5.3 | 8.6.0 | 8.6.0 | Current latest. |
| @changesets/apply-release-plan | 8.1.1 | 8.1.1 | 8.1.1 | Current latest. |
| @changesets/assemble-release-plan | 7.0.0 | 7.0.0 | 7.0.0 | Current latest. |
| @changesets/changelog-git | 1.0.0 | 1.0.0 | 1.0.0 | Current latest. |
| @changesets/cli | 3.0.3, ^3.0.3 | 3.0.3 | 3.0.3 | Current latest. |
| @changesets/config | 4.0.1 | 4.0.1 | 4.0.1 | Current latest. |
| @changesets/errors | 1.0.0 | 1.0.0 | 1.0.0 | Current latest. |
| @changesets/format | 0.1.2 | 0.1.3 | 0.1.3 | Current latest. |
| @changesets/get-dependents-graph | 3.0.0 | 3.0.0 | 3.0.0 | Current latest. |
| @changesets/git | 4.0.1 | 4.0.1 | 4.0.1 | Current latest. |
| @changesets/parse | 1.0.0 | 1.0.0 | 1.0.0 | Current latest. |
| @changesets/pre | 3.0.0 | 3.0.0 | 3.0.0 | Current latest. |
| @changesets/read | 1.0.1 | 1.0.1 | 1.0.1 | Current latest. |
| @changesets/should-skip-package | 1.0.0 | 1.0.0 | 1.0.0 | Current latest. |
| @changesets/types | 7.0.0 | 7.0.0 | 7.0.0 | Current latest. |
| @changesets/write | 1.0.1 | 1.0.1 | 1.0.1 | Current latest. |
| @cifrante/darwin-arm64 | 0.6.0 | 0.6.0 | 0.7.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. cifrante: 0.6.0 |
| @cifrante/darwin-x64 | 0.6.0 | 0.6.0 | 0.7.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. cifrante: 0.6.0 |
| @cifrante/linux-arm64-gnu | 0.6.0 | 0.6.0 | 0.7.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. cifrante: 0.6.0 |
| @cifrante/linux-arm64-musl | 0.6.0 | 0.6.0 | 0.7.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. cifrante: 0.6.0 |
| @cifrante/linux-x64-gnu | 0.6.0 | 0.6.0 | 0.7.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. cifrante: 0.6.0 |
| @cifrante/linux-x64-musl | 0.6.0 | 0.6.0 | 0.7.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. cifrante: 0.6.0 |
| @cifrante/win32-arm64 | 0.6.0 | 0.6.0 | 0.7.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. cifrante: 0.6.0 |
| @cifrante/win32-x64 | 0.6.0 | 0.6.0 | 0.7.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. cifrante: 0.6.0 |
| @clack/core | 1.5.1 | 1.5.1 | 1.5.1 | Current latest. |
| @clack/prompts | 1.8.1 | 1.8.1 | 1.8.1 | Current latest. |
| @dual-bundle/import-meta-resolve | 4.2.1 | 4.2.1 | 4.2.1 | Current latest. |
| @electron-internal/extract-zip | new/tool | 1.0.7 | 1.0.7 | Current latest. |
| @electron/asar | 4.3.1 | 4.3.1 | 4.3.1 | Current latest. |
| @electron/fuses | 2.1.3 | 2.1.3 | 2.1.3 | Current latest. |
| @electron/get | 5.1.0 | 5.1.0 | 5.1.0 | Current latest. |
| @electron/notarize | 3.1.2 | 3.1.2 | 3.1.2 | Current latest. |
| @electron/osx-sign | 2.7.2 | 2.7.2 | 2.7.2 | Current latest. |
| @electron/rebuild | 4.2.1 | 4.2.1 | 4.2.1 | Current latest. |
| @electron/universal | 3.0.6 | 3.0.6 | 3.0.6 | Current latest. |
| @esbuild/aix-ppc64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/android-arm | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/android-arm64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/android-x64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/darwin-arm64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/darwin-x64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/freebsd-arm64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/freebsd-x64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/linux-arm | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/linux-arm64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/linux-ia32 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/linux-loong64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/linux-mips64el | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/linux-ppc64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/linux-riscv64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/linux-s390x | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/linux-x64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/netbsd-arm64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/netbsd-x64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/openbsd-arm64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/openbsd-x64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/openharmony-arm64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/sunos-x64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/win32-arm64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/win32-ia32 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @esbuild/win32-x64 | 0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| @eslint-community/eslint-utils | 4.9.0 | 4.10.1 | 4.10.1 | Current latest. |
| @eslint-community/regexpp | 4.12.2 | 4.12.2 | 4.12.2 | Current latest. |
| @eslint/config-array | 0.23.5 | 0.23.5 | 0.23.5 | Current latest. |
| @eslint/config-helpers | 0.7.0 | 0.7.0 | 0.7.0 | Current latest. |
| @eslint/core | 1.2.1 | 1.2.1 | 1.2.1 | Current latest. |
| @eslint/js | 10.0.1, ^10.0.1 | 10.0.1 | 10.0.1 | Current latest. |
| @eslint/object-schema | 3.0.5 | 3.0.5 | 3.0.5 | Current latest. |
| @eslint/plugin-kit | 0.7.3 | 0.7.3 | 0.7.3 | Current latest. |
| @humanfs/core | 0.19.2 | 0.19.2 | 0.20.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @humanfs/node: ^0.19.2 |
| @humanfs/node | 0.16.8 | 0.16.8 | 0.17.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. eslint: ^0.16.6 |
| @humanfs/types | 0.15.0 | 0.15.0 | 0.16.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @humanfs/core: ^0.15.0; @humanfs/node: ^0.15.0 |
| @humanwhocodes/module-importer | 1.0.1 | 1.0.1 | 1.0.1 | Current latest. |
| @humanwhocodes/retry | 0.4.3 | 0.4.3 | 0.4.3 | Current latest. |
| @ionic/cli-framework-output | new/tool | 2.2.8 | 2.2.8 | Current latest. |
| @ionic/utils-array | new/tool | 2.1.6 | 2.1.6 | Current latest. |
| @ionic/utils-fs | new/tool | 3.1.7 | 3.1.7 | Current latest. |
| @ionic/utils-object | new/tool | 2.1.6 | 2.1.6 | Current latest. |
| @ionic/utils-process | new/tool | 2.1.12 | 2.1.12 | Current latest. |
| @ionic/utils-stream | new/tool | 3.1.7 | 3.1.7 | Current latest. |
| @ionic/utils-subprocess | new/tool | 3.0.1 | 3.0.1 | Current latest. |
| @ionic/utils-terminal | new/tool | 2.3.5 | 2.3.5 | Current latest. |
| @isaacs/fs-minipass | 4.0.1 | 4.0.1 | 4.0.1 | Current latest. |
| @keyv/bigmap | 1.3.1 | 1.3.1 | 6.1.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @cacheable/memory: ^1.3.1 |
| @keyv/serialize | 1.1.1 | 1.1.1 | 1.1.1 | Current latest. |
| @malept/cross-spawn-promise | 2.0.0 | 2.0.0 | 2.0.0 | Current latest. |
| @manypkg/find-root | 3.1.0 | 3.1.0 | 3.1.0 | Current latest. |
| @manypkg/get-packages | 3.1.0 | 3.1.0 | 3.1.0 | Current latest. |
| @manypkg/tools | 2.1.2 | 2.1.2 | 2.1.2 | Current latest. |
| @noble/hashes | 1.8.0, 2.4.0 | 1.8.0, 2.4.0 | 2.4.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. app-builder-lib: ^2.2.0; pkijs: 1.8.0 |
| @peculiar/asn1-schema | 2.11.1 | 2.11.1 | 3.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @peculiar/webcrypto: ^2.7.0; webcrypto-core: ^2.7.0 |
| @peculiar/json-schema | 1.1.12 | 1.1.12 | 3.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @peculiar/webcrypto: ^1.1.12; webcrypto-core: ^1.1.12 |
| @peculiar/utils | 2.0.3 | 2.0.3 | 4.1.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @peculiar/asn1-schema: ^2.0.2; @peculiar/webcrypto: ^2.0.2; webcrypto-core: ^2.0.2 |
| @peculiar/webcrypto | 1.7.2 | 1.7.2 | 2.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. app-builder-lib: ^1.7.1 |
| @peggyjs/from-mem | 3.1.3 | 3.1.3 | 4.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. peggy: 3.1.3 |
| @pkgr/core | 0.3.6 | 0.3.6 | 0.3.6 | Current latest. |
| @pnpm/deps.graph-sequencer | 1100.0.1 | 1100.0.1 | 1101.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @changesets/cli: ^1100.0.1 |
| @resvg/resvg-js | 2.6.2 | 2.6.2 | 2.6.2 | Current latest. |
| @resvg/resvg-js-android-arm-eabi | 2.6.2 | 2.6.2 | 2.6.2 | Current latest. |
| @resvg/resvg-js-android-arm64 | 2.6.2 | 2.6.2 | 2.6.2 | Current latest. |
| @resvg/resvg-js-darwin-arm64 | 2.6.2 | 2.6.2 | 2.6.2 | Current latest. |
| @resvg/resvg-js-darwin-x64 | 2.6.2 | 2.6.2 | 2.6.2 | Current latest. |
| @resvg/resvg-js-linux-arm-gnueabihf | 2.6.2 | 2.6.2 | 2.6.2 | Current latest. |
| @resvg/resvg-js-linux-arm64-gnu | 2.6.2 | 2.6.2 | 2.6.2 | Current latest. |
| @resvg/resvg-js-linux-arm64-musl | 2.6.2 | 2.6.2 | 2.6.2 | Current latest. |
| @resvg/resvg-js-linux-x64-gnu | 2.6.2 | 2.6.2 | 2.6.2 | Current latest. |
| @resvg/resvg-js-linux-x64-musl | 2.6.2 | 2.6.2 | 2.6.2 | Current latest. |
| @resvg/resvg-js-win32-arm64-msvc | 2.6.2 | 2.6.2 | 2.6.2 | Current latest. |
| @resvg/resvg-js-win32-ia32-msvc | 2.6.2 | 2.6.2 | 2.6.2 | Current latest. |
| @resvg/resvg-js-win32-x64-msvc | 2.6.2 | 2.6.2 | 2.6.2 | Current latest. |
| @sec-ant/readable-stream | 0.4.1 | 0.4.1 | 0.7.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. get-stream: ^0.4.1 |
| @secretlint/config-creator | 13.1.0 | 13.1.0 | 13.1.0 | Current latest. |
| @secretlint/config-loader | 13.1.0 | 13.1.0 | 13.1.0 | Current latest. |
| @secretlint/core | 13.1.0 | 13.1.0 | 13.1.0 | Current latest. |
| @secretlint/formatter | 13.1.0 | 13.1.0 | 13.1.0 | Current latest. |
| @secretlint/node | 13.1.0 | 13.1.0 | 13.1.0 | Current latest. |
| @secretlint/profiler | 13.1.0 | 13.1.0 | 13.1.0 | Current latest. |
| @secretlint/resolver | 13.1.0 | 13.1.0 | 13.1.0 | Current latest. |
| @secretlint/secretlint-rule-preset-recommend | 13.1.0 | 13.1.0 | 13.1.0 | Current latest. |
| @secretlint/source-creator | 13.1.0 | 13.1.0 | 13.1.0 | Current latest. |
| @secretlint/types | 13.1.0 | 13.1.0 | 13.1.0 | Current latest. |
| @secretlint/walker | 13.1.0 | 13.1.0 | 13.1.0 | Current latest. |
| @sindresorhus/merge-streams | 4.0.0 | 4.0.0 | 4.0.0 | Current latest. |
| @smithy/core | 3.37.0 | 3.37.0 | 3.37.0 | Current latest. |
| @smithy/credential-provider-imds | 4.5.2 | 4.5.2 | 4.5.2 | Current latest. |
| @smithy/fetch-http-handler | 5.8.0 | 5.8.0 | 5.8.0 | Current latest. |
| @smithy/node-http-handler | 4.13.0 | 4.13.0 | 4.13.0 | Current latest. |
| @smithy/signature-v4 | 5.7.4 | 5.7.4 | 5.7.4 | Current latest. |
| @smithy/types | 4.19.0 | 4.19.0 | 4.19.0 | Current latest. |
| @textlint/ast-node-types | 15.8.0 | 15.8.0 | 15.8.0 | Current latest. |
| @textlint/linter-formatter | 15.8.0 | 15.8.0 | 15.8.0 | Current latest. |
| @textlint/module-interop | 15.8.0 | 15.8.0 | 15.8.0 | Current latest. |
| @textlint/resolver | 15.8.0 | 15.8.0 | 15.8.0 | Current latest. |
| @textlint/types | 15.8.0 | 15.8.0 | 15.8.0 | Current latest. |
| @types/debug | 4.1.13 | 4.1.13 | 4.1.13 | Current latest. |
| @types/esrecurse | 4.3.1 | 4.3.1 | 4.3.1 | Current latest. |
| @types/estree | 1.0.8 | 1.0.9 | 1.0.9 | Current latest. |
| @types/fs-extra | 9.0.13 | 8.1.5, 9.0.13 | 11.0.4 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @ionic/utils-fs: ^8.0.0; app-builder-lib: 9.0.13; electron-publish: ^9.0.11 |
| @types/json-schema | 7.0.15 | 7.0.15 | 7.0.15 | Current latest. |
| @types/ms | 2.1.0 | 2.1.0 | 2.1.0 | Current latest. |
| @types/node | 26.6.5 | 24.19.2, 26.6.6 | 26.6.6 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @types/fs-extra: *; electron: ^24.9.0 |
| @types/normalize-package-data | 2.4.4 | 2.4.4 | 2.4.4 | Current latest. |
| @types/slice-ansi | new/tool | 4.0.0 | 7.1.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @ionic/utils-terminal: ^4.0.0 |
| @xmldom/xmldom | 0.8.15, 0.9.12 | 0.8.15, 0.9.12 | 0.9.12 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. plist: ^0.8.8; plist: ^0.9.10 |
| @xterm/headless | 6.0.0 | 6.0.0 | 6.0.0 | Current latest. |
| abbrev | 4.0.0 | 4.0.0 | 5.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. nopt: ^4.0.0 |
| acorn | 8.19.0 | 8.19.0 | 8.19.0 | Current latest. |
| acorn-jsx | 5.3.2 | 5.3.2 | 5.3.2 | Current latest. |
| agent-base | 7.1.4 | 7.1.4 | 9.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. http-proxy-agent: ^7.1.0; https-proxy-agent: ^7.1.2 |
| ajv | 6.15.0, 8.20.0 | 6.15.0, 8.20.0 | 8.20.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @secretlint/config-loader: ^8.20.0; app-builder-lib: ^8.18.0; eslint: ^6.14.0; table: ^8.0.1 |
| ansi-escapes | 7.3.0 | 7.3.0 | 7.3.0 | Current latest. |
| ansi-regex | 5.0.1, 6.4.0 | 5.0.1, 6.4.0 | 6.4.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. strip-ansi: ^5.0.1; strip-ansi: ^6.2.2 |
| ansi-styles | 4.3.0, 6.2.3 | 4.3.0, 6.2.3 | 7.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. chalk: ^4.1.0; slice-ansi: ^4.0.0; wrap-ansi: ^4.0.0; wrap-ansi: ^6.2.1 |
| app-builder-lib | 27.0.0-alpha.13 | 27.0.0-alpha.13 | 26.18.0 | Newer v27 prerelease retained: stable v26 contains deprecated packages; upstream electron-builder issue 10016. dmg-builder: 27.0.0-alpha.13; electron-builder-squirrel-windows: 27.0.0-alpha.13; electron-builder: 27.0.0-alpha.13 |
| argparse | 2.0.1 | 2.0.1 | 3.0.4 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. js-yaml: ^2.0.1 |
| asn1js | 3.1.0 | 3.1.0 | 4.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @peculiar/asn1-schema: ^3.0.10; app-builder-lib: ^3.0.10; pkijs: ^3.0.6; webcrypto-core: ^3.0.10 |
| astral-regex | 2.0.0 | 2.0.0 | 2.0.0 | Current latest. |
| async | 3.2.6 | 3.2.6 | 3.2.6 | Current latest. |
| async-exit-hook | 2.0.1 | 2.0.1 | 2.0.1 | Current latest. |
| asynckit | 0.4.0 | 0.4.0 | 0.5.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. form-data: ^0.4.0 |
| at-least-node | new/tool | 1.0.0 | 1.0.0 | Current latest. |
| aws4 | 1.13.2 | 1.13.2 | 1.13.2 | Current latest. |
| axe-core | 4.14.0, ^4.14.0 | 4.14.0 | 4.14.0 | Current latest. |
| balanced-match | 1.0.2, 4.0.4 | 1.0.2, 4.0.4 | 5.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. brace-expansion: ^1.0.0; brace-expansion: ^4.0.2 |
| base64-js | 1.5.1 | 1.5.1 | 1.5.1 | Current latest. |
| better-sqlite3 | 13.0.3 | 13.0.3 | 13.0.3 | Current latest. |
| big-integer | 1.6.52 | 1.6.52 | 1.6.52 | Current latest. |
| binaryextensions | 6.11.0 | 6.11.0 | 6.11.0 | Current latest. |
| bluebird | 3.7.2 | 3.7.2 | 3.7.2 | Current latest. |
| boundary | 2.0.0 | 2.0.0 | 2.0.0 | Current latest. |
| bowser | 2.15.0 | 2.15.0 | 2.15.0 | Current latest. |
| bplist-creator | new/tool | 0.1.0 | 0.3.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. simple-plist: 0.1.0 |
| bplist-parser | 0.5.0 | 0.3.1, 0.3.2, 0.5.0 | 0.5.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. browser-commander: ^0.5.0; native-run: ^0.3.2; simple-plist: 0.3.1 |
| brace-expansion | 2.1.7, 5.0.12 | 2.1.7, 5.0.12 | 5.0.12 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. minimatch: ^2.0.1; minimatch: ^5.0.8 |
| browser-commander | 0.34.0, ^0.34.0 | 0.34.0 | 0.34.0 | Current latest. |
| buffer-crc32 | new/tool | 0.2.13 | 1.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. yauzl: ~0.2.3 |
| buffer-from | 1.1.2 | 1.1.2 | 1.1.2 | Current latest. |
| builder-util | 27.0.0-alpha.13 | 27.0.0-alpha.13 | 26.16.0 | Newer v27 prerelease retained: stable v26 contains deprecated packages; upstream electron-builder issue 10016. app-builder-lib: 27.0.0-alpha.13; dmg-builder: 27.0.0-alpha.13; electron-builder-squirrel-windows: 27.0.0-alpha.13; electron-builder: 27.0.0-alpha.13; electron-publish: 27.0.0-alpha.13 |
| builder-util-runtime | 10.0.0-alpha.12 | 10.0.0-alpha.12, 9.7.0 | 9.7.0 | Newer v27 prerelease retained: stable v26 contains deprecated packages; upstream electron-builder issue 10016. app-builder-lib: 10.0.0-alpha.12; builder-util: 10.0.0-alpha.12; dmg-builder: 10.0.0-alpha.12; electron-builder: 10.0.0-alpha.12; electron-publish: 10.0.0-alpha.12; electron-updater: 9.7.0 |
| bytestreamjs | 2.0.1 | 2.0.1 | 3.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. pkijs: ^2.0.1 |
| cac | 7.1.0 | 7.1.0 | 7.1.0 | Current latest. |
| cacheable | 2.5.0 | 2.5.0 | 2.5.0 | Current latest. |
| call-bind-apply-helpers | 1.0.2 | 1.0.2 | 1.0.2 | Current latest. |
| chalk | 4.1.2, 5.6.2 | 4.1.2, 5.6.2 | 6.0.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @secretlint/formatter: ^5.6.2; builder-util: ^4.1.2; electron-builder: ^4.1.2; electron-publish: ^4.1.2 |
| chownr | 3.0.0 | 3.0.0 | 3.0.0 | Current latest. |
| chromium-pickle-js | 0.2.0 | 0.2.0 | 0.2.0 | Current latest. |
| ci-info | 4.3.1, 4.4.0 | 4.3.1, 4.4.0 | 4.4.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. app-builder-lib: 4.3.1; electron-builder: ^4.2.0 |
| cifrante | 0.6.0 | 0.6.0 | 0.7.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. teleproto: 0.6.0 |
| cliui | 8.0.1, 9.0.1 | 8.0.1, 9.0.1 | 9.0.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. yargs: ^8.0.1; yargs: ^9.0.1 |
| color-convert | 2.0.1 | 2.0.1 | 3.1.3 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. ansi-styles: ^2.0.1 |
| color-name | 1.1.4 | 1.1.4 | 2.1.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. color-convert: ~1.1.4 |
| combined-stream | 1.0.8 | 1.0.8 | 1.0.8 | Current latest. |
| command-stream | 2.6.0 | 2.6.0 | 2.6.0 | Current latest. |
| commander | 14.0.3, 15.0.0 | 12.1.0, 14.0.3, 15.0.0 | 15.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @capacitor/cli: ^12.1.0; katex: ^15.0.0; peggy: ^14.0.3 |
| core-util-is | 1.0.3 | 1.0.3 | 1.0.3 | Current latest. |
| cross-spawn | 7.0.6 | 7.0.6 | 7.0.6 | Current latest. |
| csv-parse | 7.0.3 | 7.0.3 | 7.0.3 | Current latest. |
| debug | 4.4.3 | 4.4.3 | 4.4.3 | Current latest. |
| deep-is | 0.1.4 | 0.1.4 | 0.1.4 | Current latest. |
| define-lazy-prop | new/tool | 2.0.0 | 3.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. open: ^2.0.0 |
| delayed-stream | 1.0.0 | 1.0.0 | 1.0.0 | Current latest. |
| dmg-builder | 27.0.0-alpha.13 | 27.0.0-alpha.13 | 26.18.0 | Newer v27 prerelease retained: stable v26 contains deprecated packages; upstream electron-builder issue 10016. app-builder-lib: 27.0.0-alpha.13; electron-builder: 27.0.0-alpha.13 |
| dotenv | 17.4.2 | 17.4.2 | 18.0.9 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. app-builder-lib: ^17.4.2; dotenv-expand: ^17.4.2 |
| dotenv-expand | 13.0.0 | 13.0.0 | 1000.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. app-builder-lib: ^13.0.0 |
| doublets-web | 0.1.3, ^0.1.3 | 0.1.3 | 0.1.3 | Current latest. |
| dunder-proto | 1.0.1 | 1.0.1 | 1.0.1 | Current latest. |
| duplexer2 | 0.1.4 | 0.1.4 | 0.1.4 | Current latest. |
| editions | 6.22.0 | 6.22.0 | 6.22.0 | Current latest. |
| ejs | 3.1.10 | 3.1.10 | 7.0.2 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. app-builder-lib: ^3.1.8 |
| electron | ^44.9.0 | 45.1.0 | 45.1.0 | Current latest. |
| electron-builder | 27.0.0-alpha.13 | 27.0.0-alpha.13 | 26.18.0 | Newer v27 prerelease retained: stable v26 contains deprecated packages; upstream electron-builder issue 10016.  |
| electron-builder-squirrel-windows | 27.0.0-alpha.13 | 27.0.0-alpha.13 | 26.18.0 | Newer v27 prerelease retained: stable v26 contains deprecated packages; upstream electron-builder issue 10016. app-builder-lib: 27.0.0-alpha.13 |
| electron-publish | 27.0.0-alpha.13 | 27.0.0-alpha.13 | 26.18.0 | Newer v27 prerelease retained: stable v26 contains deprecated packages; upstream electron-builder issue 10016. app-builder-lib: 27.0.0-alpha.13; electron-builder: 27.0.0-alpha.13 |
| electron-updater | ^6.8.9 | 6.8.11 | 6.8.11 | Current latest. |
| elementtree | new/tool | 0.1.7 | 0.1.7 | Current latest. |
| emoji-regex | 10.6.0, 8.0.0 | 10.6.0, 8.0.0 | 11.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. string-width: ^10.3.0; string-width: ^8.0.0 |
| env-paths | 2.2.1, 3.0.0 | 2.2.1, 3.0.0 | 4.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @capacitor/cli: ^2.2.0; @electron/get: ^3.0.0; node-gyp: ^2.2.0 |
| environment | 1.1.0 | 1.1.0 | 1.1.0 | Current latest. |
| err-code | 2.0.3 | 2.0.3 | 3.0.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. promise-retry: ^2.0.2 |
| es-define-property | 1.0.1 | 1.0.1 | 1.0.1 | Current latest. |
| es-errors | 1.3.0 | 1.3.0 | 1.3.0 | Current latest. |
| es-object-atoms | 1.1.2 | 1.1.2 | 1.1.2 | Current latest. |
| es-set-tostringtag | 2.1.0 | 2.1.0 | 2.1.0 | Current latest. |
| esbuild | 0.28.2, ^0.28.2 | 0.28.2 | 0.28.2 | Current latest. |
| escalade | 3.2.0 | 3.2.0 | 3.2.0 | Current latest. |
| escape-string-regexp | 4.0.0 | 4.0.0 | 5.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. eslint: ^4.0.0 |
| eslint | 10.13.0, ^10.13.0 | 10.13.0 | 10.13.0 | Current latest. |
| eslint-config-prettier | 10.1.8, ^10.1.8 | 10.1.8 | 10.1.8 | Current latest. |
| eslint-plugin-prettier | 5.5.7, ^5.5.7 | 5.5.7 | 5.5.7 | Current latest. |
| eslint-scope | 9.1.2 | 9.1.2 | 9.1.2 | Current latest. |
| eslint-visitor-keys | 3.4.3, 5.0.1 | 3.4.3, 5.0.1 | 5.0.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @eslint-community/eslint-utils: ^3.4.3; eslint: ^5.0.1; espree: ^5.0.1 |
| espree | 11.2.0 | 11.2.0 | 11.2.0 | Current latest. |
| esquery | 1.7.0 | 1.7.0 | 1.7.0 | Current latest. |
| esrecurse | 4.3.0 | 4.3.0 | 4.3.0 | Current latest. |
| estraverse | 5.3.0 | 5.3.0 | 5.3.0 | Current latest. |
| esutils | 2.0.3 | 2.0.3 | 2.0.3 | Current latest. |
| execa | 10.2.1 | 10.2.1 | 10.2.1 | Current latest. |
| exponential-backoff | 3.1.3 | 3.1.3 | 3.1.3 | Current latest. |
| fast-deep-equal | 3.1.3 | 3.1.3 | 3.1.3 | Current latest. |
| fast-diff | 1.3.0 | 1.3.0 | 1.3.0 | Current latest. |
| fast-json-stable-stringify | 2.1.0 | 2.1.0 | 2.1.0 | Current latest. |
| fast-levenshtein | 2.0.6 | 2.0.6 | 3.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. optionator: ^2.0.6 |
| fast-string-truncated-width | 3.0.3 | 3.0.3 | 3.0.3 | Current latest. |
| fast-string-width | 3.0.2 | 3.0.2 | 3.0.2 | Current latest. |
| fast-uri | 3.1.9 | 3.1.9 | 4.2.3 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. ajv: ^3.0.1 |
| fast-wrap-ansi | 0.2.2 | 0.2.2 | 0.2.2 | Current latest. |
| fd-slicer | new/tool | 1.1.0 | 1.1.0 | Current latest. |
| fdir | 6.5.0 | 6.5.0 | 6.5.0 | Current latest. |
| figures | 6.1.0 | 6.1.0 | 6.1.0 | Current latest. |
| file-entry-cache | 11.1.5 | 11.1.5 | 11.1.5 | Current latest. |
| filelist | 1.0.6 | 1.0.6 | 2.0.2 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. jake: ^1.0.4 |
| find-up | 5.0.0 | 5.0.0 | 8.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. eslint: ^5.0.0 |
| flat-cache | 6.1.23 | 6.1.23 | 6.1.23 | Current latest. |
| flatted | 3.4.4 | 3.4.4 | 3.4.4 | Current latest. |
| form-data | 4.0.6 | 4.0.6 | 4.0.6 | Current latest. |
| fs-extra | 10.1.0, 11.3.1, 11.4.1 | 10.1.0, 11.3.1, 11.4.1, 9.1.0 | 11.4.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @capacitor/cli: ^11.2.0; @ionic/utils-fs: ^9.0.0; app-builder-lib: ^11.3.0; builder-util: ^11.3.0; dmg-builder: ^11.3.0; electron-builder: ^11.3.0; electron-publish: ^11.3.0; electron-updater: ^10.1.0; temp-file: ^10.0.0; unzipper: 11.3.1 |
| function-bind | 1.1.2 | 1.1.2 | 1.1.2 | Current latest. |
| get-caller-file | 2.0.5 | 2.0.5 | 2.0.5 | Current latest. |
| get-east-asian-width | 1.7.0 | 1.7.0 | 1.7.0 | Current latest. |
| get-intrinsic | 1.3.0 | 1.3.0 | 1.3.0 | Current latest. |
| get-proto | 1.0.1 | 1.0.1 | 1.0.1 | Current latest. |
| get-stream | 9.0.1 | 9.0.1 | 9.0.1 | Current latest. |
| getenv | 2.0.0 | 2.0.0 | 2.0.0 | Current latest. |
| gifenc | 1.0.3 | 1.0.3 | 1.0.3 | Current latest. |
| glob | 13.0.6 | 13.0.6 | 14.0.3 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @electron/asar: ^13.0.2; rimraf: ^13.0.3 |
| glob-parent | 6.0.2 | 6.0.2 | 6.0.2 | Current latest. |
| gopd | 1.2.0 | 1.2.0 | 1.2.0 | Current latest. |
| graceful-fs | 4.2.11 | 4.2.11 | 4.2.11 | Current latest. |
| has-flag | 4.0.0, 5.0.1 | 4.0.0, 5.0.1 | 5.0.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. supports-color: ^4.0.0; supports-hyperlinks: ^5.0.1 |
| has-symbols | 1.1.0 | 1.1.0 | 1.1.0 | Current latest. |
| has-tostringtag | 1.0.2 | 1.0.2 | 1.0.2 | Current latest. |
| hashery | 1.5.1 | 1.5.1 | 3.0.5 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @cacheable/utils: ^1.5.1; @keyv/bigmap: ^1.4.0 |
| hasown | 2.0.4 | 2.0.4 | 2.0.4 | Current latest. |
| hookified | 1.15.1, 2.2.0 | 1.15.1, 2.2.0 | 3.1.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @cacheable/memory: ^1.15.1; @keyv/bigmap: ^1.15.0; cacheable: ^1.15.0; flat-cache: ^1.15.0; hashery: ^1.15.0; qified: ^2.1.1 |
| hosted-git-info | 4.1.0, 9.0.3 | 4.1.0, 9.0.3 | 10.1.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. app-builder-lib: ^4.1.0; normalize-package-data: ^9.0.0 |
| http-proxy-agent | 7.0.2 | 7.0.2 | 9.1.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. builder-util: ^7.0.0 |
| https-proxy-agent | 7.0.6 | 7.0.6 | 9.1.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. builder-util: ^7.0.0 |
| human-id | 4.2.2 | 4.2.2 | 4.2.2 | Current latest. |
| human-signals | 8.0.1 | 8.0.1 | 8.0.1 | Current latest. |
| husky | 9.1.7, ^9.1.7 | 9.1.7 | 9.1.7 | Current latest. |
| ignore | 5.3.2, 7.0.14 | 5.3.2, 7.0.14 | 7.0.14 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @secretlint/walker: ^7.0.13; eslint: ^5.2.0 |
| import-meta-resolve | 4.2.0 | 4.2.0 | 4.2.0 | Current latest. |
| imurmurhash | 0.1.4 | 0.1.4 | 0.1.4 | Current latest. |
| index-to-position | 1.2.0 | 1.2.0 | 1.2.0 | Current latest. |
| inherits | 2.0.4 | 2.0.4 | 2.0.4 | Current latest. |
| ini | new/tool | 4.1.3 | 7.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. native-run: ^4.1.1 |
| ip-address | 10.7.4 | 10.7.5 | 10.7.5 | Current latest. |
| is-docker | new/tool | 2.2.1 | 4.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. is-wsl: ^2.0.0; open: ^2.1.1 |
| is-extglob | 2.1.1 | 2.1.1 | 2.1.1 | Current latest. |
| is-fullwidth-code-point | 3.0.0 | 3.0.0 | 5.1.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. slice-ansi: ^3.0.0; string-width: ^3.0.0 |
| is-glob | 4.0.3 | 4.0.3 | 4.0.3 | Current latest. |
| is-plain-obj | 4.1.0 | 4.1.0 | 4.1.0 | Current latest. |
| is-stream | 4.0.1 | 4.0.1 | 4.0.1 | Current latest. |
| is-unicode-supported | 2.1.0 | 2.1.0 | 2.1.0 | Current latest. |
| is-wsl | new/tool | 2.2.0 | 3.1.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. open: ^2.2.0 |
| isarray | 1.0.0 | 1.0.0 | 2.0.5 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. readable-stream: ~1.0.0 |
| isbinaryfile | 4.0.10, 5.0.7 | 4.0.10, 5.0.7 | 6.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @electron/osx-sign: ^4.0.8; app-builder-lib: ^5.0.0 |
| isexe | 2.0.0, 3.1.5, 4.0.0 | 2.0.0, 3.1.5, 4.0.0 | 4.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. which: ^2.0.0; which: ^3.1.1; which: ^4.0.0 |
| istextorbinary | 9.5.0 | 9.5.0 | 9.5.0 | Current latest. |
| jake | 10.9.4 | 10.9.4 | 13.0.3 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. ejs: ^10.8.5 |
| jiti | 2.7.0 | 2.7.0 | 2.7.0 | Current latest. |
| jju | 1.4.0 | 1.4.0 | 1.4.0 | Current latest. |
| js-tokens | 4.0.0 | 4.0.0 | 10.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @babel/code-frame: ^4.0.0 |
| js-yaml | 4.3.2 | 4.3.2 | 5.5.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @textlint/linter-formatter: ^4.3.0; app-builder-lib: ^4.1.0; builder-util: ^4.1.0; dmg-builder: ^4.1.0; electron-updater: ^4.1.0; rc-config-loader: ^4.1.1 |
| jscpd | 5.4.2, ^5.4.1 | 5.4.2 | 5.4.2 | Current latest. |
| jscpd-darwin-arm64 | 5.4.2 | 5.4.2 | 5.4.2 | Current latest. |
| jscpd-darwin-x64 | 5.4.2 | 5.4.2 | 5.4.2 | Current latest. |
| jscpd-linux-arm64-gnu | 5.4.2 | 5.4.2 | 5.4.2 | Current latest. |
| jscpd-linux-arm64-musl | 5.4.2 | 5.4.2 | 5.4.2 | Current latest. |
| jscpd-linux-x64-gnu | 5.4.2 | 5.4.2 | 5.4.2 | Current latest. |
| jscpd-linux-x64-musl | 5.4.2 | 5.4.2 | 5.4.2 | Current latest. |
| jscpd-windows-arm64-msvc | 5.4.2 | 5.4.2 | 5.4.2 | Current latest. |
| jscpd-windows-x64-msvc | 5.4.2 | 5.4.2 | 5.4.2 | Current latest. |
| json-schema-traverse | 0.4.1, 1.0.0 | 0.4.1, 1.0.0 | 1.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. ajv: ^0.4.1; ajv: ^1.0.0 |
| json-stable-stringify-without-jsonify | 1.0.1 | 1.0.1 | 1.0.1 | Current latest. |
| json5 | 2.2.3 | 2.2.3 | 2.2.3 | Current latest. |
| jsonc-parser | 3.3.1 | 3.3.1 | 3.3.1 | Current latest. |
| jsonfile | 6.2.1 | 6.2.1 | 6.2.1 | Current latest. |
| katex | 0.19.1 | 0.19.1 | 0.19.1 | Current latest. |
| keyv | 5.6.0 | 5.6.0 | 6.1.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @cacheable/memory: ^5.6.0; @cacheable/utils: ^5.6.0; @keyv/bigmap: ^5.6.0; cacheable: ^5.6.0 |
| kleur | new/tool | 3.0.3, 4.1.5 | 4.1.5 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @capacitor/cli: ^4.1.5; prompts: ^3.0.3 |
| launch-editor | 2.14.2 | 2.14.2 | 2.14.2 | Current latest. |
| lazy-val | 1.0.5 | 1.0.5 | 1.0.5 | Current latest. |
| levn | 0.4.1 | 0.4.1 | 0.4.1 | Current latest. |
| links-notation | 0.11.2, 0.13.0, 0.25.2, 0.27.1, ^0.27.1 | 0.11.2, 0.13.0, 0.25.2, 0.27.1 | 0.27.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. browser-commander: ^0.25.2; lino-arguments: ^0.27.1; lino-env: ^0.11.2; lino-objects-codec: ^0.27.1; meta-language: 0.13.0; meta-sovereign: ^0.27.1 |
| lino-arguments | 0.4.0 | 0.4.0 | 0.4.0 | Current latest. |
| lino-env | 0.2.8 | 0.2.8 | 0.2.8 | Current latest. |
| lino-objects-codec | 0.9.3, ^0.9.2 | 0.9.3 | 0.9.3 | Current latest. |
| lint-staged | 17.6.0, ^17.6.0 | 17.6.0 | 17.6.0 | Current latest. |
| locate-path | 6.0.0 | 6.0.0 | 8.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. find-up: ^6.0.0 |
| lodash | 4.18.1 | 4.18.1 | 4.18.1 | Current latest. |
| lodash.escaperegexp | new/tool | 4.1.2 | 4.1.2 | Current latest. |
| lodash.isequalwith | new/tool | 4.4.0 (staged updater alias) | 4.4.0 | Scoped desktop override in prepare-desktop; preserves updater equality until electron-builder issue 10016 is released. |
| lodash.truncate | 4.4.2 | 4.4.2 | 4.4.2 | Current latest. |
| log-lazy | 1.0.4 | 1.0.4 | 1.0.4 | Current latest. |
| lottie-web | 5.13.0 | 5.13.0 | 5.13.0 | Current latest. |
| lru-cache | 11.5.3, 6.0.0 | 11.5.3, 6.0.0 | 11.5.3 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. hosted-git-info: ^11.1.0; hosted-git-info: ^6.0.0; path-scurry: ^11.0.0 |
| math-intrinsics | 1.1.0 | 1.1.0 | 1.1.0 | Current latest. |
| meta-language | 0.46.0 | 0.46.0 | 0.46.0 | Current latest. |
| mime | 2.6.0, 3.0.0 | 2.6.0, 3.0.0 | 4.1.2 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. electron-publish: ^2.5.2; teleproto: ^3.0.0 |
| mime-db | 1.52.0 | 1.52.0 | 1.54.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. mime-types: 1.52.0 |
| mime-types | 2.1.35 | 2.1.35 | 3.0.2 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. form-data: ^2.1.35 |
| minimatch | 10.2.6, 5.1.9 | 10.2.6, 5.1.9 | 11.0.3 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @electron/asar: ^10.0.1; @eslint/config-array: ^10.2.4; app-builder-lib: ^10.2.5; eslint: ^10.2.5; filelist: ^5.0.1; glob: ^10.2.2 |
| minipass | 7.1.3 | 7.1.3 | 7.1.3 | Current latest. |
| minizlib | 3.1.0 | 3.1.0 | 3.1.0 | Current latest. |
| ms | 2.1.3 | 2.1.3 | 2.1.3 | Current latest. |
| native-run | new/tool | 2.0.3 | 2.0.3 | Current latest. |
| natural-compare | 1.4.0 | 1.4.0 | 1.4.0 | Current latest. |
| node | new/tool | 26.12.1 | 26.12.1 | Toolchain pinned across workflows and Docker. |
| node-abi | 4.40.0 | 4.40.0 | 4.40.0 | Current latest. |
| node-addon-api | 7.1.1, 8.9.2 | 7.1.1, 8.9.2 | 8.9.2 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. better-sqlite3: ^8.0.0; node-pty: ^7.1.0 |
| node-api-version | 0.2.1 | 0.2.1 | 0.2.1 | Current latest. |
| node-gyp | 12.4.0 | 12.4.0 | 13.1.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @electron/rebuild: ^12.2.0 |
| node-int64 | 0.4.0 | 0.4.0 | 0.4.0 | Current latest. |
| node-localstorage | 2.2.1 | 2.2.1 | 3.0.5 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. teleproto: ^2.2.1 |
| node-pty | 1.1.0 | 1.1.0 | 1.1.0 | Current latest. |
| nopt | 9.0.0 | 9.0.0 | 10.0.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. node-gyp: ^9.0.0 |
| normalize-package-data | 8.0.0 | 8.0.0 | 9.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. read-pkg: ^8.0.0 |
| npm | new/tool | 12.2.1 | 12.2.1 | Toolchain pinned across workflows and Docker. |
| npm-check-updates | new/tool | 23.1.1 | 23.1.1 | One-off upgrade tool used for this investigation; not a runtime dependency. |
| npm-run-path | 6.0.0 | 6.0.0 | 6.0.0 | Current latest. |
| open | new/tool | 8.4.2 | 11.0.4 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @capacitor/cli: ^8.4.0 |
| optionator | 0.9.4 | 0.9.4 | 0.9.4 | Current latest. |
| p-limit | 3.1.0 | 3.1.0 | 7.3.3 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. p-locate: ^3.0.2 |
| p-locate | 5.0.0 | 5.0.0 | 7.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. locate-path: ^5.0.0 |
| p-map | 7.1.1 | 7.1.1 | 7.1.1 | Current latest. |
| package-json-from-dist | new/tool | 1.0.1 | 1.0.1 | Current latest. |
| package-manager-detector | 1.9.0 | 1.9.0 | 1.9.0 | Current latest. |
| pako | 1.0.11 | 1.0.11 | 3.0.3 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. upng-js: ^1.0.5 |
| parse-json | 8.3.0 | 8.3.0 | 8.3.0 | Current latest. |
| parse-ms | 4.0.0 | 4.0.0 | 4.0.0 | Current latest. |
| path-exists | 4.0.0 | 4.0.0 | 5.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. find-up: ^4.0.0 |
| path-key | 3.1.1, 4.0.0 | 3.1.1, 4.0.0 | 4.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. cross-spawn: ^3.1.0; npm-run-path: ^4.0.0 |
| path-scurry | 2.0.2 | 2.0.2 | 3.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. glob: ^2.0.2 |
| pe-library | 2.0.1 | 2.0.1 | 2.0.1 | Current latest. |
| peggy | 5.1.0 | 5.1.0 | 5.1.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. meta-language: 5.1.0 |
| pend | new/tool | 1.2.0 | 1.2.0 | Current latest. |
| picocolors | 1.1.1 | 1.1.1 | 1.1.1 | Current latest. |
| picomatch | 4.0.7 | 4.0.7 | 4.0.7 | Current latest. |
| pkijs | 3.4.3 | 3.4.3 | 4.0.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. app-builder-lib: ^3.4.0 |
| playwright | 1.64.1, ^1.64.1 | 1.64.1 | 1.64.1 | Current latest. |
| playwright-core | 1.64.1 | 1.64.1 | 1.64.1 | Current latest. |
| plist | 3.1.0, 3.1.1, 5.0.0 | 3.1.0, 3.1.1, 5.0.0 | 5.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @capacitor/cli: ^3.1.0; @electron/osx-sign: ^3.0.5; @electron/universal: ^3.1.0; app-builder-lib: 3.1.0; browser-commander: ^5.0.0; native-run: ^3.1.0; simple-plist: ^3.0.5 |
| pluralize | 2.0.0, 8.0.0 | 2.0.0, 8.0.0 | 8.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @secretlint/formatter: ^8.0.0; @textlint/linter-formatter: ^2.0.0 |
| prelude-ls | 1.2.1 | 1.2.1 | 1.2.1 | Current latest. |
| prettier | 3.9.10, ^3.9.10 | 3.9.10 | 3.9.10 | Current latest. |
| prettier-linter-helpers | 1.0.1 | 1.0.1 | 1.0.1 | Current latest. |
| pretty-ms | 9.3.1 | 9.3.1 | 10.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. execa: ^9.3.1 |
| proc-log | 6.1.0 | 6.1.0 | 7.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. node-gyp: ^6.0.0 |
| process-nextick-args | 2.0.1 | 2.0.1 | 2.0.1 | Current latest. |
| progress | 2.0.3 | 2.0.3 | 2.0.3 | Current latest. |
| promise-retry | 2.0.1 | 2.0.1 | 2.0.1 | Current latest. |
| prompts | new/tool | 2.4.2 | 2.4.2 | Current latest. |
| proper-lockfile | 4.1.2 | 4.1.2 | 4.1.2 | Current latest. |
| punycode | 2.3.1 | 2.3.1 | 2.3.1 | Current latest. |
| pvtsutils | 1.3.6 | 1.3.6 | 1.3.6 | Current latest. |
| pvutils | 1.2.0 | 1.2.0 | 2.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. asn1js: ^1.2.0; pkijs: ^1.1.3 |
| qified | 0.10.1 | 0.10.1 | 0.13.2 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. cacheable: ^0.10.1 |
| rc-config-loader | 4.1.4 | 4.1.4 | 4.1.4 | Current latest. |
| react | 19.3.1, ^19.3.1 | 19.3.1 | 19.3.1 | Current latest. |
| react-dom | 19.3.1, ^19.3.1 | 19.3.1 | 19.3.1 | Current latest. |
| read-binary-file-arch | 1.0.6 | 1.0.6 | 1.0.6 | Current latest. |
| read-pkg | 10.1.0 | 10.1.0 | 10.1.0 | Current latest. |
| readable-stream | 2.3.8 | 2.3.8, 3.6.2 | 4.8.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. duplexer2: ^2.0.2; through2: 3 |
| require-directory | 2.1.1 | 2.1.1 | 2.1.1 | Current latest. |
| require-from-string | 2.0.2 | 2.0.2 | 2.0.2 | Current latest. |
| resedit | 3.1.0 | 3.1.0 | 3.1.0 | Current latest. |
| retry | 0.12.0 | 0.12.0 | 0.13.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. promise-retry: ^0.12.0; proper-lockfile: ^0.12.0 |
| rimraf | new/tool | 6.1.3 | 6.1.3 | Current latest. |
| safe-buffer | 5.1.2 | 5.1.2, 5.2.1 | 5.2.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. readable-stream: ~5.1.1; string_decoder: ~5.1.0; string_decoder: ~5.2.0 |
| sanitize-filename | 1.6.4 | 1.6.4 | 1.6.4 | Current latest. |
| sax | 1.6.1 | 1.1.4, 1.6.1 | 1.6.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. builder-util-runtime: ^1.2.4; elementtree: 1.1.4; xml2js: >=0.6.0 |
| scheduler | 0.28.0 | 0.28.0 | 0.28.0 | Current latest. |
| secretlint | 13.1.0 | 13.1.0 | 13.1.0 | Current latest. |
| semver | 5.7.2, 7.7.4, 7.8.5 | 5.7.2, 7.7.4, 7.8.5 | 7.8.5 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @capacitor/cli: ^7.6.3; @changesets/apply-release-plan: ^7.8.1; @changesets/assemble-release-plan: ^7.8.1; @changesets/cli: ^7.8.1; @changesets/get-dependents-graph: ^7.8.1; @electron/get: ^7.6.3; @electron/osx-sign: ^7.7.1; @peggyjs/from-mem: 7.7.4; app-builder-lib: ~7.7.3; electron-updater: ~7.7.3; node-abi: ^7.6.3; node-api-version: ^7.3.5; node-gyp: ^7.3.5; normalize-package-data: ^7.3.5; simple-update-notifier: ^7.5.3; tiny-async-pool: ^5.5.0 |
| shebang-command | 2.0.0 | 2.0.0 | 2.0.0 | Current latest. |
| shebang-regex | 3.0.0 | 3.0.0 | 4.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. shebang-command: ^3.0.0 |
| shell-quote | 1.12.0 | 1.12.0 | 1.12.0 | Current latest. |
| signal-exit | 3.0.7, 4.1.0 | 3.0.7, 4.1.0 | 4.1.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @ionic/utils-process: ^3.0.3; @ionic/utils-terminal: ^3.0.3; execa: ^4.1.0; proper-lockfile: ^3.0.2 |
| simple-plist | new/tool | 1.3.1 | 1.3.1 | Current latest. |
| simple-update-notifier | 2.0.0 | 2.0.0 | 2.0.0 | Current latest. |
| sisteransi | 1.0.5 | 1.0.5 | 2.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @clack/core: ^1.0.5; @clack/prompts: ^1.0.5; prompts: ^1.0.5 |
| slice-ansi | 4.0.0 | 4.0.0 | 9.0.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @ionic/utils-terminal: ^4.0.0; table: ^4.0.0 |
| slide | 1.1.6 | 1.1.6 | 1.1.6 | Current latest. |
| smart-buffer | 4.2.0 | 4.2.0 | 4.2.0 | Current latest. |
| socks | 2.8.10 | 2.8.10 | 2.8.10 | Current latest. |
| source-map | 0.6.1 | 0.6.1 | 0.8.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. source-map-support: ^0.6.0 |
| source-map-generator | 2.0.6 | 2.0.6 | 2.0.7 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. peggy: 2.0.6 |
| source-map-support | 0.5.21 | 0.5.21 | 0.5.21 | Current latest. |
| spdx-correct | 3.2.0 | 3.2.0 | 3.2.0 | Current latest. |
| spdx-exceptions | 2.5.0 | 2.5.0 | 2.5.0 | Current latest. |
| spdx-expression-parse | 3.0.1 | 3.0.1 | 5.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. spdx-correct: ^3.0.0; validate-npm-package-license: ^3.0.0 |
| spdx-license-ids | 3.0.24 | 3.0.24 | 3.0.24 | Current latest. |
| split2 | new/tool | 4.2.0 | 4.2.0 | Current latest. |
| stat-mode | 1.0.0 | 1.0.0 | 1.0.0 | Current latest. |
| store2 | 2.14.4 | 2.14.4 | 2.14.4 | Current latest. |
| stream-buffers | new/tool | 2.2.0 | 3.0.3 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. bplist-creator: 2.2.x |
| string-argv | 0.3.2 | 0.3.2 | 0.4.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. lint-staged: ^0.3.2 |
| string-width | 4.2.3, 7.2.0, 8.3.0 | 4.2.3, 7.2.0, 8.3.0 | 8.3.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @ionic/utils-terminal: ^4.1.0; @textlint/linter-formatter: ^4.2.3; cliui: ^4.2.0; cliui: ^7.2.0; table: ^4.2.3; wrap-ansi: ^4.1.0; wrap-ansi: ^7.0.0; yargs: ^4.2.3; yargs: ^8.2.1 |
| string_decoder | 1.1.1 | 1.1.1, 1.3.0 | 1.3.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. readable-stream: ^1.1.1; readable-stream: ~1.1.1 |
| strip-ansi | 6.0.1, 7.2.0 | 6.0.1, 7.2.0 | 7.2.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @ionic/utils-terminal: ^6.0.0; @textlint/linter-formatter: ^6.0.1; cliui: ^6.0.1; cliui: ^7.1.0; string-width: ^6.0.1; string-width: ^7.1.0; string-width: ^7.1.2; table: ^6.0.1; wrap-ansi: ^6.0.0; wrap-ansi: ^7.1.0 |
| strip-final-newline | 4.0.0 | 4.0.0 | 4.0.0 | Current latest. |
| structured-source | 4.0.0 | 4.0.0 | 4.0.0 | Current latest. |
| sumchecker | 3.0.1 | 3.0.1 | 3.0.1 | Current latest. |
| supports-color | 10.2.2, 7.2.0 | 10.2.2, 7.2.0 | 11.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. chalk: ^7.1.0; supports-hyperlinks: ^10.2.2 |
| supports-hyperlinks | 4.6.0 | 4.6.0 | 4.6.0 | Current latest. |
| synckit | 0.12.3 | 0.12.3 | 0.12.3 | Current latest. |
| table | 6.9.0 | 6.9.0 | 6.9.0 | Current latest. |
| tagged-tag | 1.0.0 | 1.0.0 | 1.0.0 | Current latest. |
| tar | 7.5.22 | 7.5.22 | 7.5.22 | Current latest. |
| teleproto | 1.232.0 | 1.232.0 | 1.232.0 | Current latest. |
| temp-file | 3.4.0 | 3.4.0 | 3.4.0 | Current latest. |
| terminal-link | 5.0.0 | 5.0.0 | 5.0.0 | Current latest. |
| test-anywhere | 0.9.1, ^0.9.1 | 0.9.1 | 0.9.1 | Current latest. |
| text-table | 0.2.0 | 0.2.0 | 0.2.0 | Current latest. |
| textextensions | 6.11.0 | 6.11.0 | 6.11.0 | Current latest. |
| through2 | new/tool | 4.0.2 | 5.0.12 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. native-run: ^4.0.2 |
| tiny-async-pool | 1.3.0 | 1.3.0 | 2.1.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. app-builder-lib: 1.3.0; builder-util: 1.3.0 |
| tiny-typed-emitter | new/tool | 2.1.0 | 2.1.0 | Current latest. |
| tinyexec | 1.3.1 | 1.3.1 | 1.3.1 | Current latest. |
| tinyglobby | 0.2.17 | 0.2.17 | 0.2.17 | Current latest. |
| tree-kill | new/tool | 1.2.2 | 1.2.2 | Current latest. |
| truncate-utf8-bytes | 1.0.2 | 1.0.2 | 1.0.2 | Current latest. |
| tslib | 2.8.1 | 2.8.1 | 2.8.1 | Current latest. |
| type-check | 0.4.0 | 0.4.0 | 0.4.0 | Current latest. |
| type-fest | 4.41.0, 5.10.0 | 4.41.0, 5.10.0 | 5.10.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. parse-json: ^4.39.1; read-pkg: ^5.4.4 |
| undici | 6.29.1, 7.30.1 | 6.29.1, 7.30.1 | 8.12.3 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @electron/get: ^7.24.4; app-builder-lib: ^7.30.1; node-gyp: ^6.25.0 |
| undici-types | 8.9.0 | 7.24.6, 8.9.0 | 8.12.3 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @types/node: >=7.24.0 <7.24.7; @types/node: ~8.9.0 |
| unicorn-magic | 0.3.0, 0.4.1 | 0.3.0, 0.4.1 | 0.4.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. npm-run-path: ^0.3.0; read-pkg: ^0.4.0 |
| universalify | 2.0.1 | 2.0.1 | 2.0.1 | Current latest. |
| untildify | new/tool | 4.0.0 | 6.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @ionic/utils-terminal: ^4.0.0 |
| unzipper | 0.12.5 | 0.12.5 | 0.12.5 | Current latest. |
| upng-js | 2.1.0 | 2.1.0 | 2.1.0 | Current latest. |
| uri-js | 4.4.1 | 4.4.1 | 4.4.1 | Current latest. |
| utf8-byte-length | 1.0.5 | 1.0.5 | 1.0.5 | Current latest. |
| util-deprecate | 1.0.2 | 1.0.2 | 1.0.2 | Current latest. |
| validate-npm-package-license | 3.0.4 | 3.0.4 | 3.0.4 | Current latest. |
| version-range | 4.15.0 | 4.15.0 | 4.15.0 | Current latest. |
| webcrypto-core | 1.9.2 | 1.9.2 | 2.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @peculiar/webcrypto: ^1.9.2 |
| webp-wasm | 1.0.6 | 1.0.6 | 1.0.6 | Current latest. |
| which | 2.0.2, 5.0.0, 6.0.1 | 2.0.2, 5.0.0, 6.0.1 | 7.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. app-builder-lib: ^5.0.0; cross-spawn: ^2.0.1; node-gyp: ^6.0.0 |
| which-command | 0.1.0 | 0.1.0 | 0.1.0 | Current latest. |
| word-wrap | 1.2.5 | 1.2.5 | 1.2.5 | Current latest. |
| wrap-ansi | 7.0.0, 9.0.2 | 7.0.0, 9.0.2 | 10.0.2 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. @ionic/utils-terminal: ^7.0.0; cliui: ^7.0.0; cliui: ^9.0.0 |
| write-file-atomic | 1.3.4 | 1.3.4 | 8.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. node-localstorage: ^1.1.4 |
| xcode | new/tool | 4.0.0 | 4.0.0 | Current latest. |
| xml2js | new/tool | 0.6.2 | 0.6.2 | Current latest. |
| xmlbuilder | 15.1.1 | 11.0.1, 15.1.1 | 15.1.1 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. plist: ^15.1.1; xml2js: ~11.0.0 |
| y18n | 5.0.8 | 5.0.8 | 5.0.8 | Current latest. |
| yallist | 4.0.0, 5.0.0 | 4.0.0, 5.0.0 | 5.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. lru-cache: ^4.0.0; tar: ^5.0.0 |
| yaml | 2.9.1 | 2.9.1 | 2.9.1 | Current latest. |
| yargs | 17.7.3, 18.2.0 | 17.7.3, 18.2.0 | 18.2.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. electron-builder: ^17.6.2; lino-arguments: ^18.2.0 |
| yargs-parser | 21.1.1, 22.0.0 | 21.1.1, 22.0.0 | 22.0.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. yargs: ^21.1.1; yargs: ^22.0.0 |
| yauzl | new/tool | 2.10.0 | 3.4.0 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. native-run: ^2.10.0 |
| yocto-queue | 0.1.0 | 0.1.0 | 1.2.2 | Parent constraints retain these versions; incompatible overrides would change upstream APIs without an upstream migration. p-limit: ^0.1.0 |
| yoctocolors | 2.2.0 | 2.2.0 | 2.2.0 | Current latest. |
