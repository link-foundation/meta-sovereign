# Retain the reviewed watch configuration

[PR57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft;
all unmet issue requirements remain open.

Inspecting a browser question accepted selected rule IDs, local or named profile
values, matching settings and bounded answer context. The finite watcher then
replanned with defaults. A reviewed answer could become unavailable, or another
approved rule could enter the automatic plan. This was found by following the
inspection record into the watch cycle; no live account was used.

Inspection now saves detached, normalized planning settings. The watch retains
those settings, resolves named profiles from current storage on every plan and
rechecks them inside the provider queue. A changed queued plan refuses delivery.
Actual question, chat and choices still come from the provider; caller-supplied
acceptance proofs are excluded and watches never invoke a model. An older review
without saved settings must be inspected again before starting a new watch.

Reproduce with `python3 experiments/issue-56/question-watch-planning-before.py`.
It temporarily restores the four actual production modules from parent
`2b0f6557`, runs three bounded regressions and restores current source in `finally`.
All three fail against the parent and pass after the fix: a selected rule filter,
a detached local profile and a queued named-profile change. The last case retains
a definite failed reservation and makes zero provider calls.

The focused Node run passes 42 checks covering the new regressions, existing
watch/review transports and named profiles. The corresponding Deno run passes 21
checks with type checking. This backend correction does not change UI markup;
the watcher screenshots remain in [the watch case study](question-watch.md).
The [hashed evidence archive](data/question-watch-planning.tar.sha256.json)
preserves before/after sources, scripts and verification logs. All-unread
orchestration, live provider parity and every other unchecked criterion remain
unfinished.
