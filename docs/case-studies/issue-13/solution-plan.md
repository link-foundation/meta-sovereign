# Solution plan for issue #13

| Requirement | Plan                                                                                                                                                                | Status |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| R-N1        | Read the stored tutorial step id during fresh overlay initialization and map it to the current `defaultSteps` array.                                                | Done   |
| R-N2        | On `Next`, write the next step id to `metaSovereignTutorial` before rendering that step.                                                                            | Done   |
| R-N3        | Keep `Skip step` on the same advance path as `Next`, so skipped-step progress is persisted identically.                                                             | Done   |
| R-N4        | On the final step, write `{ off: true, completed: true, at }` so completed tutorials remain dismissed across refresh.                                               | Done   |
| R-N5        | Keep `useTutorialPreference().reopen()` clearing the stored preference before opening the overlay. The overlay now reads current storage instead of stale memoized. | Done   |
| R-N6        | Save issue, issue comments, PR data, PR comment streams, PR reviews, and issue / after-fix screenshots under this case-study folder.                                | Done   |
| R-N7        | Replace the stale issue-13 case study with this repository issue's timeline, root cause, component survey, and plan.                                                | Done   |
| R-N8        | Record MDN and React documentation findings in `external-research.md`.                                                                                              | Done   |
| R-N9        | Confirm the bug is in this repository's state/storage contract, not an external component; no upstream issue is needed.                                             | Done   |

## Verification plan

- Add a unit reproduction that renders `TutorialOverlay` with a stored
  `stepId` and expects the matching step.
- Add helper tests for progress and completion preferences.
- Add an optional browser e2e step that clicks `Next`, reloads, and
  verifies the second tutorial step remains visible.
- Rebuild `js/src/web/app.min.js`.
- Run focused tests, full JS tests, lint, format check, file-line
  checks, and available browser verification.
