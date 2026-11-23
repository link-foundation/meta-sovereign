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

## Interactive decisions and save verification

`cv-experience-linkedin-position-start --fingerprint <approved-fingerprint>`
opens the reviewed position in the separate LinkedIn window. Once it is
prepared, `y` requests Save, `s` requests Skip, and `q` or closed stdin leaves
the draft open. The corresponding Lino start, status, decide and stop routes
use the exact operation request ID. A separate `status` command reads the
durable record, and starting an existing request returns its status.

The native decision checks that the form still belongs to the reviewed action
and that the owner has made no intervening input. A verified Save requires a
positive provider indication and a fresh export that matches the exact role
and approved fields. An owner Save is recorded separately from an explicit
CLI or API decision. Navigation away, an ordinary close and stale readback
leave `providerSaved` false. The job leaves any provider follow-up for the
owner, including invitations.

`linkedin-position-job-native.mjs` uses Chromium and intercepted provider
pages. It exercises Skip with the native discard confirmation, Stop with the
draft open, navigation without Save, an owner Save verified by a fresh
export, and an explicit Save where stale readback leaves the result
unconfirmed. The same request recovers its status without submitting again.
`cv-linkedin-position-job.test.js` checks the foreground keys and EOF,
acknowledgement before opening, and trusted Lino admission and recovery.

The shared CV review, native skill and media selection, interactive queue and
authenticated verification remain open in [HH21](experience-sync-plan.md).
