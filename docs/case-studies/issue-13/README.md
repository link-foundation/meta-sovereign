# Case Study: Issue #13 - Persist tutorial progress across refresh

**Issue:** [#13 - After page refresh progress of tutorial is not saved](https://github.com/link-foundation/meta-sovereign/issues/13)
**Author:** [@konard](https://github.com/konard)
**Branch:** `issue-13-a1a0ad676c96`
**Pull Request:** [#14](https://github.com/link-foundation/meta-sovereign/pull/14)

This case study records the raw issue data, screenshot, root cause,
requirements, external research, and solution plan for the tutorial
progress persistence bug.

## Artefacts

| File                   | Purpose                                                                    |
| ---------------------- | -------------------------------------------------------------------------- |
| `README.md`            | This case study and root-cause summary.                                    |
| `requirements.md`      | Atomic requirements extracted from issue #13.                              |
| `solution-plan.md`     | Requirement-to-change plan for PR #14.                                     |
| `components.md`        | Existing in-tree components and library options reviewed.                  |
| `external-research.md` | External facts about `localStorage` and React state lifetime.              |
| `assets/`              | Downloaded issue screenshot and after-fix browser verification screenshot. |
| `data/`                | Raw issue, issue comments, PR, PR comments, PR reviews, and test captures. |

## Timeline

| Time (UTC)          | Event                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-03 19:38:27 | Issue #13 opened with a screenshot showing the tutorial modal at step 1 after page refresh.                                |
| 2026-05-03 19:39:39 | Draft PR #14 created on branch `issue-13-a1a0ad676c96`.                                                                    |
| 2026-05-03 19:43    | Issue screenshot downloaded to `assets/issue-screenshot.png` and validated as a PNG by checking its file signature.        |
| 2026-05-03 19:45    | A focused unit reproduction was added: seeded `stepId: "automation"` still rendered the welcome step.                      |
| 2026-05-03 19:48    | Tutorial progress persistence was implemented and the focused test passed.                                                 |
| 2026-05-03 19:58    | A Playwright browser check verified that step 2 survives reload; screenshot saved as `assets/tutorial-progress-after.png`. |

## Reproduction

1. Open the SPA with no stored tutorial preference.
2. Click `Next` until the tutorial reaches a later step.
3. Refresh the page.
4. Before the fix, the overlay returns to `welcome` / step 1.

The automated reproduction in `js/tests/tutorial.test.js` simulates a
fresh page load by seeding `localStorage` with
`{ "stepId": "automation" }` and rendering `TutorialOverlay`. The old
implementation ignored that preference and rendered step 1.

## Root Cause

The tutorial had two independent state paths:

- `localStorage` under `metaSovereignTutorial` stored only the
  complete-off state (`{ "off": true, "at": ... }`).
- The current tutorial step lived only in React component state:
  `const [index, setIndex] = useState(0)`.

Because React component state is tied to the mounted component instance,
a full page refresh discards that state. Since no step id was written
to storage, the overlay had no durable progress to restore.

A secondary issue was that `TutorialOverlay` memoized the stored
preference by storage object identity. That made storage reads stale
when the same mounted overlay was reopened after changing the stored
preference. PR #14 reads the current preference when the overlay
renders and derives the initial index from stored progress.

## Solution

PR #14 keeps the current in-tree tutorial layer and extends its
existing storage contract:

- `writeProgressPreference(storage, step)` stores the current step id
  as `{ "stepId": "...", "at": ... }` whenever the user clicks
  `Next` or `Skip step`.
- `readProgressIndex(storage, steps)` maps the stored step id back to
  the current step list on page load.
- `writeCompletedPreference(storage)` marks a finished tutorial as
  completed and off, so it does not reappear after a refresh.
- The optional Playwright e2e suite now includes a real browser reload
  check for tutorial progress.

No third-party onboarding dependency is required. The existing custom
React overlay is small, licensed consistently with the repository, and
only needed durable state synchronization.

## Upstream Issues

The bug is inside this repository's tutorial state handling. No
external project or library is the root cause, so no upstream GitHub
issue is required.

## Status

Implemented in PR #14. Traceability is recorded in
[`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md) section
**N. Tutorial progress persistence (issue #13)**.
