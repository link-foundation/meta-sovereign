# Issue #13 - Atomic requirements (`R-N*`)

The text of
[issue #13](https://github.com/link-foundation/meta-sovereign/issues/13)
is captured in [`data/issue-13.json`](./data/issue-13.json). Each
`R-N*` row below is a single testable requirement extracted from the
issue body and screenshot.

| ID   | Requirement                                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| R-N1 | Tutorial step progress must survive a full page refresh.                                                                            |
| R-N2 | The tutorial must persist progress when the user advances with `Next`.                                                              |
| R-N3 | The tutorial must persist progress when the user skips an individual step.                                                          |
| R-N4 | Completing the tutorial must persist a completed/off state so refresh does not reopen it from step 1.                               |
| R-N5 | Reopening the tutorial from the header must still start a fresh tutorial after a stored off/completed preference is cleared.        |
| R-N6 | Raw issue and PR data, comments, reviews, and screenshots must be compiled under `docs/case-studies/issue-13/`.                     |
| R-N7 | The case study must reconstruct the timeline, requirements, root cause, known components/libraries, and solution plans.             |
| R-N8 | External research must be recorded for the browser and React state behavior that explains the bug.                                  |
| R-N9 | If the root cause is in another project, an upstream GitHub issue must be filed with a reproduction and workaround; otherwise note. |
