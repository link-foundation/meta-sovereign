# External form learning acceptance mapping

This maps QA23 in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
to the complete pinned `konard/hh-ru@fa0991b8c2d0896fb3b4be6c69947f0590094b15`
B2/B3/B11/B14/B23/B24 contract. B23 explicitly extends submission learning:
an owner edit that differs from the prefill is also saved after an unchanged
minute, before Send. The inventory's older “only confirmed final submission”
wording must include this later requirement. The completed
[hosted and assertion review](hosted-form-prefill-learning-997b0dd2.md)
accepts QA23 at `997b0dd2` after all five exact-source workflows pass.

## Current behavior

Each external review slot has its own persistent browser profile and exact CDP
target, separate from the HH automation browser. Reading and prefilling never
click Next or Send. The owner opens each later page and explicitly plans it;
actual question/answer pairs accumulate across those planned pages. Text,
selected option labels, complete checkbox/radio groups and dates are retained.
Protected values and incomplete groups are excluded.

Learning defaults on. `--no-learn`, the API's `learn: false` and shared UI opt-out
disable it. A detached, authenticated local worker per slot survives the
initiating CLI's exit. Reattaching preserves its page, values and worker identity.
Owner activity extends the 24-hour idle lifetime; passive status reads do not.
Close, Stop, browser closure and idle expiry drain owned learning and capture
work. Saved bounded history remains readable after Stop, without control tokens.

The learner establishes a baseline from actual planned/applied values. An edit
requires trusted evidence for that particular control, a different value, a full
60,000 unchanged milliseconds and actual readback. It rechecks readback after
waiting for the shared writer, immediately before storage. Its own unchanged
prefill, a changed-back edit and simultaneous script changes cannot teach it.

Submission learning requires an owner Send/Enter gesture followed within two
minutes by completion in the same document/frame: a new confirmation, a genuine
Google Forms response URL or the form disappearing. Next, synthetic clicks,
`requestSubmit()` alone, stale/foreign completion and failed HTTP navigation do
not qualify. Vietnamese Send/confirmation and language-independent Google URL
evidence are covered. Repeated observations do not recount the same answer.

Actual answers pass the shared current knowledge and privacy policy. Contacts
become current profile placeholders; empty/clarification answers, unchanged
profile contacts, assignment links, rejected alternatives, questions back and
already-known answers are skipped. New proposals remain unapproved. Queue
contention, changed policy/profile, partial storage failure, incomplete capture
and cleanup failures retain accurate counts and refusal states. Finite field,
pair, byte, queue, journal and retry limits prevent an incomplete observation
from claiming a complete save.

## Reproduction and verification

The original [owned learning](forms-answer-learning.md) archive preserves the
failing browser baseline, actual owner gestures, minute-boundary unit checks,
two-page completion and independent MCP readback. The later
[detached watcher](forms-detached-watchers.md) archive adds the actual CLI exit,
persistent browser, full production minute, worker reuse, shared storage writer,
one owner submission and acknowledged Stop. Both archives retain implementation
bytes; the integrity audit checks every entry and compares current source
changes. Integrity alone does not establish acceptance.

Current learner, passive document observer, monitor, writer admission, detached
worker/control and review lifecycle paths were reviewed with their focused
assertions. The hosted collector requires every named learning, observer,
monitor, watcher, local-channel, store and review-session check in the successful
exact-source Node job. The normal Forms learning scenario runs awaited native
gesture, stable-edit and later-page completion assertions in both browser
engines. Its older completion marker has no JSON semantic envelope, so the
assertion source is retained and reviewed separately.

A separate mandatory watcher group runs
[`examples/forms-detached-review.mjs`](../../../examples/forms-detached-review.mjs):
Chromium CDP is used in either hosted lane. It verifies two planned pages,
zero submissions before Send, a full unchanged production
minute after CLI exit, the same reused worker, two unapproved proposals with
count one after one owner Send, saved history and confirmed Stop. Each lane's actual
structured receipt and successful group completion are required. The previous
reader import followed a fixture method that exits, so it never ran in CI;
[the coverage correction](ci-forms-watchers.md) retains that evidence. Every owned
fixture process and browser is drained by the example's final cleanup.

These are native isolated form fixtures, matching the pinned reference's own
verification scope; they do not claim authenticated Google/Yandex account
acquisition. QA22's complete contact/resume/prefill workflow, QA24's assignment
handoff and all other unchecked criteria remain required. PR57 stays draft and
unmerged until the complete issue is verified.
