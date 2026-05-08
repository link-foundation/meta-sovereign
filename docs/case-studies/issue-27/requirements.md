# Issue 27 Requirements Matrix

## Direct Requirements

| Requirement                                                         | Status                 | Evidence                                                                                                                      |
| ------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Data sections should only show a small link/button to Connections.  | Implemented            | `ConnectionGuide` renders `data-action="open-connections"` and no provider setup cards.                                       |
| Connections must clearly show which services are connected or not.  | Preserved and extended | `ConnectionsList` still renders one provider card per catalogued service with state badges from saved `secret:*` links.       |
| Each service should have a dedicated page/screen.                   | Preserved              | `ConnectionDetail` opens by provider id and supports `#conn-{provider}` deep links.                                           |
| Each service page must include instructions.                        | Preserved              | `ConnectionDetail` still renders `providerSetupSteps[providerId]`.                                                            |
| Each service page must include all existing fields.                 | Implemented            | `ProviderCredentialsForm` now renders provider credential fields inside `ConnectionDetail`.                                   |
| Each service page must support import from exported files/archives. | Implemented            | `ProviderArchiveImport` now lives in the provider detail controls.                                                            |
| Each service page must support direct connection/probe.             | Implemented            | `ConnectionProbeRow` now lives in the provider detail controls.                                                               |
| Do not delete features or text.                                     | Implemented            | Provider catalogue text, localized copy, docs links, archive hints, probe hints, and settings/probe strings remain available. |
| Create docs/case-studies/issue-27 with data and analysis.           | Implemented            | This folder contains raw GitHub artifacts, screenshots, requirements, root cause, and solution notes.                         |
| Search online for additional facts and data.                        | Implemented            | See `external-research.md`.                                                                                                   |
| Reconstruct timeline/sequence of events.                            | Implemented            | See `README.md`.                                                                                                              |
| List root causes and solution plans for each problem.               | Implemented            | See `README.md` and `solution-plan.md`.                                                                                       |

## Follow-Up From Issue 25

| Issue 25 Expectation                                          | Issue 27 Interpretation                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| External services connections should be on a separate page.   | Connections is the owner of provider setup, not Settings and not data pages.                                       |
| Service items should show connected/not connected.            | Provider cards keep their connected/action-required/not-connected state.                                           |
| If not connected, redirect to a separate service screen/page. | Empty states and provider cards route to the matching provider detail.                                             |
| Service setup should be clearly explained.                    | Existing setup steps remain on the provider detail, next to the operational controls.                              |
| Tutorial should guide to service connections.                 | Existing tutorial ids are preserved; provider detail now exposes a stable `connection-detail:{providerId}` target. |

## Non-Requirements

- Adding Chakra UI was not required for issue 27. The current repo uses
  lightweight React components and plain CSS; adding a UI framework only for
  this refactor would increase scope and bundle/dependency risk.
- Replacing the custom SPA view switcher with a router was not required.
  The existing `meta-sovereign:navigate` event and hash anchor model already
  support the required data-page -> Connections -> provider detail flow.
