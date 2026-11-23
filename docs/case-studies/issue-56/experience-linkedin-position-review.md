# Private LinkedIn position reviews

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) can stage one
HeadHunter-to-LinkedIn comparison row by its request ID, reply fingerprint and
zero-based job index. Staging selects the exact native position link, or the
separately observed Add position link. Neither staging nor approving opens a
browser or saves the provider form.

The staged review replays the private, hashed LinkedIn browser evidence and
matches the canonical export against its acknowledged receipt. Imported
LinkedIn snapshots with pasted edit URLs, changed evidence, target-only
positions and stale comparison fingerprints cannot authorize a form. The
review keeps the source report intact, saves the exact proposed text and
dates, and lists eligible skill and website candidates. Existing identical
skills and website links are omitted from those candidates. The form still
needs to confirm the available controls, baseline, skills and media.

A separate approval produces its own private fingerprint. Recovering a staged
or approved fingerprint reads storage without browser work. Failed approval
leaves the original draft usable. An approved review is rechecked against the
export before native preparation.

`cv-experience-linkedin-position-stage`, `cv-experience-linkedin-position-review`
and `cv-experience-linkedin-position-stored` expose this workflow in the CLI.
The corresponding `linkedin-position-*` experience routes support text and
binary Lino. `cv-linkedin-position-review.test.js` exercises grouped roles,
standalone Add, immutable baseline and approval, corrupted native evidence,
imported targets, both encodings and trusted mutation admission. It counts
browser starts and confirms that staging and approval never add one.

## Native form preparation

The preparation adapter takes the same persistent `linkedin-experience` slot
lease as acquisition. It observes the selected link again on the current
profile, requires one labeled native dialog and checks the editor baseline
before changing any fields. It preserves existing owner drafts in the slot,
checks the current draft before each field change, and leaves the browser
window open on detach. The adapter disables the position notification control
when it is on. It never submits the form.

The Chromium fixture in `linkedin-position-native.mjs` covers the exact
grouped role update, standalone Add, date fields revealed by the current-role
checkbox, and an untouched employment-type field. It reproduces the stale
description and a concurrent owner edit, then verifies both are preserved.
Two preparations complete and neither clicks Save. The fixture runs in the
existing LinkedIn browser scenario. It uses synthetic provider pages.

The shared CV review, native skill and media selection, interactive decisions
and fresh provider Save verification remain open in [HH21](experience-sync-plan.md).
