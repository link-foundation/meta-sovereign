# Component and library survey for issue #13

## In-tree components

| Component / file                     | Relevance                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `js/src/web/tutorial.js`             | Owns `defaultSteps`, `TutorialOverlay`, `TutorialButton`, `useTutorialPreference`, and tutorial storage I/O.   |
| `js/src/web/app.js`                  | Mounts the tutorial overlay and wires the header button, close, dismiss, and completion callbacks.             |
| `js/tests/tutorial.test.js`          | Unit coverage for storage helpers, default step shape, and the stored-progress reload reproduction.            |
| `js/tests/e2e-browser-spa.mjs`       | Optional real-browser SPA suite; now includes click -> reload tutorial persistence coverage.                   |
| `docs/case-studies/issue-10/`        | Original onboarding/tutorial case study. It explains why the project chose an in-tree React overlay.           |
| `docs/REQUIREMENTS.md` section **M** | Existing tutorial requirements R-M9..R-M12: walkthrough, per-step skip, full off switch, and later re-open.    |
| `docs/REQUIREMENTS.md` section **N** | New issue #13 requirements for persisting the current tutorial step and completed state.                       |
| `js/src/web/app.min.js`              | Built SPA bundle shipped to Pages, Electron, and mobile packaging paths. Must be rebuilt after source changes. |

## Root-cause components

The affected state was split between React memory and browser storage.
Before PR #14, only the off preference was durable. The active step
index existed only as `useState(0)`, so reload always started the
component from step 1.

## Existing library options

Issue #10 already surveyed guided-tour libraries:

- Driver.js - MIT
- React Joyride - MIT
- Reactour - MIT
- Intro.js - AGPL/commercial
- Shepherd.js - AGPL/commercial

None solves this issue better than the existing component. The bug is
not missing tour functionality; it is a missing durable progress field
in the existing storage contract. Keeping the in-tree component avoids
new dependency, bundle-size, and license risk.

## Debug and verbose mode decision

The screenshot, source code, and focused reproduction were sufficient
to identify the root cause. Additional runtime debug output would add
noise to a user-facing tutorial path, so PR #14 does not add new
logging.
