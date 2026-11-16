# macOS first-launch documentation

This addresses the installation instructions within VD09 in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57). It does not
accept the wider desktop runtime or artifact criterion.

- [x] Read the complete pinned desktop requirement, current download copy,
      README and installation guide in all four supported languages. The
      download page already provides both methods; the README lacks them and
      the guide lacks the Terminal alternative.
- [x] Check Apple's current first-launch guidance, retaining the URL, review
      date and source publication date. Keep ad-hoc signing distinct from
      notarization.
- [x] Add checksum-first instructions to all four READMEs and installation
      guides, including the macOS 15 GUI path and the existing narrowly scoped
      quoted Terminal command. Preserve the other installation paths.
- [x] Review all eight documentation diffs, run scoped formatting and whitespace
      checks, and preserve parent/current text with the validation receipts.
- [ ] Publish this documentation step, inspect the current-commit hosted
      checks, and retain platform runtime verification as separate evidence.

No application, browser, shell command from the instructions or macOS security
setting is exercised by this documentation review. Full platform checks belong
in CI; every unfinished original criterion remains active.
