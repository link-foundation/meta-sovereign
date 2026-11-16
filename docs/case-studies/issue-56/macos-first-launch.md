# macOS installation instructions

The pinned desktop requirements explicitly require both the Terminal quarantine
command and the macOS 15 first-launch GUI route in the README and download page.
The existing localized download page includes both. The four READMEs only link
to installation guides, and those guides omit the Terminal alternative and put
checksum instructions after their launch exception.

The updated READMEs and guides explain verification against the same release's
checksum manifest before either launch method. They use the existing download
model's command, scoped to the installed app, with its space-containing path
quoted. ZIP downloads must be expanded before copying the app. The GUI route
starts by attempting to open the app, then uses its individual Privacy & Security
exception. The text distinguishes ad-hoc signing from Apple notarization and
retains existing platform, update and installation guidance.

The GUI instructions were checked on 2026-11-16 against
[Apple's first-launch guidance](https://support.apple.com/en-us/102445), published
2026-05-27. This reference supports the per-app exception; the Terminal command
comes from the existing repository download model. No Apple support claim for
that command is made.

All eight diffs were reviewed in English, Russian, Chinese and Hindi. Scoped
Prettier and `git diff --check` pass. These are documentation checks on a Linux
host: no macOS runtime, downloaded installer, Gatekeeper prompt or command from
the instructions was executed. The text change does not alter the download UI
or require a new browser fixture. It supplies part of VD09's instruction audit;
the five packaged artifacts and platform behavior still need their hosted
receipts. VD09 and all other unfinished criteria remain unchecked in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

Evidence: [parent/current text and check receipts](data/macos-first-launch.tar.gz),
[hash manifest](data/macos-first-launch.tar.sha256.json).
The [plan](macos-first-launch-plan.md) keeps publication and hosted review open.
