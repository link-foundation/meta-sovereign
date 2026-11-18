# Desktop provider dependency plan

The staged desktop manifest currently keeps only root production dependencies and the updater. Browser Commander, Playwright and teleproto are optional for library consumers, but the desktop product exposes browser automation and Telegram. A clean installer therefore omits the implementations those controls need. The existing boundary check only inspects declared dependencies, so it accepts their omission.

1. Preserve a failing regression against the actual parent manifest and omitted-provider validation. Compare the pinned desktop reference, current shared provider loaders and existing packaging conventions.
2. Promote the shared browser packages and Telegram into staged production dependencies using the root version constraints. Preserve root dependency overrides and keep test tooling and Electron out of production dependencies. Reject a missing version instead of silently generating an incomplete installer.
3. Make the isolated staging check require those providers and load the actual staged browser and Telegram adapters without launching a browser, opening an account or starting a server. Preserve dependency-boundary refusals.
4. Run only the two focused packaging test files and changed-file checks locally. Use the existing hosted desktop build matrix for clean production installation and platform packaging. Archive parent failures, sources and verification results; update PR 57 and the existing release note.

This fixes a packaging prerequisite of VD01. It does not establish automatic preparation of remote runner prerequisites, browser executables or authenticated provider workflows; those criteria remain unfinished.
