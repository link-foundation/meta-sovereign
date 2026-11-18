# Keep weighted preview assertions precise with match inspection enabled

Published `4bb612207b6cc2673862a6f5a196d13775096a6b` failed the Chromium questions
scenario in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
The retained shard-3 log identifies the exact assertion at lines 1147–1155:
`getByText` matched both the main answer's `pre` and its ranked candidate's
`span`. The preceding matching scenario left “Inspect all eligible matches”
enabled. The focused weighted scenario had previously run with inspection off,
so it missed that valid combination. This was an ambiguous test lookup, with no
product assertion failure or timeout.

The weighted scenario now explicitly enables inspection, verifies the exact main
preview text through its direct `pre`, and requires ranked candidates to remain
visible. It still verifies reviewed approximate matching, exact approved wording,
unchanged ordered behavior and actual action persistence. It restores the
previous inspection choice along with matching settings when it finishes.

A focused native Chromium run with inspection forced on reproduces the original
strict-mode error. The corrected run passes and records `requiresReview: true`
and `methodSaved: true`. Its isolated application/browser fixtures close through
the existing test cleanup. Hosted Chromium/WebKit sequence coverage remains
mandatory on the next published commit. No production UI or matcher is changed
by this correction. The PR remains draft and all unfinished criteria remain
required.
