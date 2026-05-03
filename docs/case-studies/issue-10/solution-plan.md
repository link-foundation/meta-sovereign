# Solution plan for issue #10

This document maps each `R-M*` requirement (see
[`requirements.md`](./requirements.md)) to a concrete deliverable in
PR #11. Items marked _Done_ point at the file or symbol that closes
the requirement.

## Phase 1 — Connection-guide registry and component

| Item | Deliverable                                                                                                                                                             | Status |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| R-M1 | `js/src/web/connection-guides.js` exports a registry mapping every nav surface (`chat`, `operator`, `contacts`, …, `status`) to a guide object.                         | Done   |
| R-M2 | The guide object lists the providers that feed the section and inlines the install / connect text per provider.                                                         | Done   |
| R-M3 | Each provider entry has an "import archive" path with the file name conventions and one-paragraph instructions.                                                         | Done   |
| R-M4 | Each provider entry has an "API credentials" path with the canonical env var (e.g. `VK_ACCESS_TOKEN`) and the docs link to obtain it.                                   | Done   |
| R-M7 | All install instructions for the local server live inline in the new `LocalServerHelp` component; no external links to GitHub READMEs are required to start the server. | Done   |

## Phase 2 — Browser-first connection attempts and CORS detection

| Item | Deliverable                                                                                                                                            | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| R-M5 | `tryDirect()` in `connection-guides.js` performs a `fetch()` to the provider URL and reports the result.                                               | Done   |
| R-M6 | `tryDirect()` classifies a failure as `cors` when the request raised before producing a response, and surfaces the inline "start a local server" CTA.  | Done   |
| R-M8 | `tryDirect()` runs even when the SPA is offline (no server discovered); only the CORS-classified branch falls back to the local-server recommendation. | Done   |

## Phase 3 — Tutorial layer

| Item  | Deliverable                                                                                                                                               | Status |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| R-M9  | `js/src/web/tutorial.js` exports a React `TutorialOverlay` component that walks the user through the headline flows (chat, contacts, automation, backup). | Done   |
| R-M10 | Each step renders a "skip step" button that advances past the current step without aborting the rest.                                                     | Done   |
| R-M11 | A "turn off tutorial" button stores the preference in `localStorage` so the overlay does not reappear.                                                    | Done   |
| R-M12 | A persistent "Tutorial" button in the app header lets the user re-open the overlay at any time.                                                           | Done   |

## Phase 4 — Documentation and traceability

| Item  | Deliverable                                                                                                                                                                                                    | Status |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| R-M13 | `docs/REQUIREMENTS.md` adds section **M** with rows R-M1 .. R-M18 in the same global list.                                                                                                                     | Done   |
| R-M14 | This case study folder (`docs/case-studies/issue-10/`) ships `README.md`, `requirements.md`, `solution-plan.md`, `components.md`, `external-research.md`, `data/issue-10.json`, `data/issue-10-comments.json`. | Done   |
| R-M15 | `requirements.md` lists every `R-M*` row.                                                                                                                                                                      | Done   |
| R-M16 | `solution-plan.md` (this file) maps each `R-M*` to a concrete deliverable.                                                                                                                                     | Done   |
| R-M17 | `components.md` and `external-research.md` cover existing components / libraries and external prior art.                                                                                                       | Done   |
| R-M18 | All work lands in PR #11 on branch `issue-10-a884af8ade4e`.                                                                                                                                                    | Done   |

## Phase 5 — Tests

- `js/tests/connection-guides.test.js` — asserts every nav surface in
  `views.js` has a matching guide, asserts the guides cite the
  correct providers, asserts CORS classification works for both
  the success and the cross-origin-failure path.
- `js/tests/tutorial.test.js` — asserts step skipping, the
  "turn off" toggle, the storage round trip, and the "re-open"
  affordance.

Both tests run under `node --test` and the existing
`test-anywhere` shim, matching the repository test convention
(R-H4).

## Out of scope

- Adding new provider connectors. The nine existing adapters are the
  surface for the empty-state guides.
- Replacing the discovery logic. `discoverServer()` already covers
  the localhost / saved override / runtime shell candidates.
- A visual redesign of the rest of the SPA. Issue #10 is about
  empty states + tutorial; the rest of the design audit (R-H1 /
  `docs/UI-DESIGN-AUDIT.md`) stays unchanged.
