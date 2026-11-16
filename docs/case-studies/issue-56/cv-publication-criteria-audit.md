# Saved snapshot publication acceptance audit

HH23 requires optional sanitized snapshot publication while keeping full private
exports, existing PDFs, backups and pending plans intact. The pinned contract is
`konard/hh-ru@fa0991b8c2d0896fb3b4be6c69947f0590094b15`, README lines
1016–1019 and 1032. Snapshots represent saved source data; a pending edit cannot
become a published provider save. The complete criterion remains pending until
the original behavior mapping and all five exact-source hosted workflows pass
in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

## Source selection and privacy

The shared publisher accepts three explicitly selected immutable sources:

- A [verified owner Save](cv-publication.md), captured by the passive watcher
  after saved-state verification. Cancel and failed validation provide no new
  saved snapshot.
- An existing [native résumé export](cv-publication-exports.md), bound to its
  export identity, selected résumé, private content hash and capture time.
- A stored [experience document](experience-publication.md), bound to its
  immutable revision. The interface identifies this captured document without
  claiming that publication confirms a new provider Save.

The common public CV allowlist removes unknown private fields and media. Shared
privacy checks remove contact, salary and birth information from public prose
and refuse forbidden structured fields. The original full exports and experience
documents remain unchanged. The publication service neither imports a pending
edit nor refreshes a provider. A changed source, stale hash, wrong browser slot,
invalid identity or ambiguous source selection refuses publication before Git.

Each plan freezes the canonical repository, remote, branch, exact snapshot paths,
source hashes, sanitized Lino bytes and expiry. CLI, both actual Lino encodings
and the shared four-language controls use that same plan. Source or target changes
clear consent. Reload restores the recorded state with fresh consent required;
the independent native-save and experience panels cannot share consent.

## Private files and Git effects

An explicit reviewed confirmation permits only the frozen sanitized paths.
The Git writer uses its own index and content-addressed writes, checks the
existing remote branch and URL again, and refuses collisions or unexpected
movement. It preserves unrelated staged changes, full exports, PDFs, backups and
pending plans byte for byte. It does not force a push, follow tags, run unrelated
filters or change repository/global configuration.

The durable attempt and commit receipts precede their corresponding effects.
A lost acknowledgement leaves an uncertain state; status, reload, restart and
repeated requests never repeat the attempt. Stop drains the owned operation.
The [native Windows comparison](ci-publication-long-paths.md) retains the bounded
321-character failure without the scoped Git option and successful publication
with it in Node, Deno and Bun. The original earlier failure's exact Git operation
was not witnessed and remains unknown. The separately reproduced
[two-panel browser failure](ci-publication-panels.md) is corrected by selecting
each scenario's owning panel; no assertion or timeout was relaxed.

## Regression and hosted evidence

The six publication test files cover isolated local Git repositories, exact
private-file preservation, source/plan tampering, symlinks, remote changes,
unacknowledged writes, uncertainty, cancellation and both Lino encodings. The
original archives retain the actual-parent failures for missing publication
sources and the later Windows/browser corrections. Existing screenshots and
independent Playwright MCP evidence remain linked in those behavior records.

The source audit streams 40 archives and verifies all 2,336 manifest entries.
It includes all six publication archives and records later production differences
against the selected published source. Those differences have been reviewed:
native-export and experience source selection retain the original public
projection, confirmation, exact-path Git and non-replaying recovery contracts.
The consent archive has no production source hashes; its CI evidence is retained
without inventing archive provenance.

The hosted collector requires every named portable publication check, including
both dynamically named Lino variants, from the selected source's successful Node
job. Chromium and WebKit must each execute all three mandatory publication
scenarios. Their semantic receipts require zero provider sessions, four locales,
private-source preservation and recovery without another push. The owner-save
scenario requires two local pushes and preserved private index; the native-export
and experience scenarios each require one local push. The native export and two
private experience originals must remain intact. The five-workflow gate remains
mandatory; old archives and passing individual jobs cannot replace it.

This mapping covers HH23. New/shared workplace identities, copy/detach queues and
full CV synchronization retain their separate unfinished requirements. PR57 stays
draft and unmerged until every original criterion is implemented and verified.
