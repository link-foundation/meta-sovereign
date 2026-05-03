# Issue #10 — Atomic requirements (`R-M*`)

The text of [issue #10](https://github.com/link-foundation/meta-sovereign/issues/10) is captured in
[`data/issue-10.json`](./data/issue-10.json). Each `R-M*` row below is
a single, testable requirement extracted from the issue body. The
canonical surface lives in
[`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md) section
**M. Newbie-friendly UI (issue #10)**.

| ID    | Requirement                                                                                                                                                                                                                                              |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-M1  | No SPA section may render a bare empty-data placeholder. Every nav surface (chat, operator, contacts, automation, patterns, replies, facts, audience, broadcast, outreach, profile, backup, status) must, when empty, render a connection guide instead. |
| R-M2  | Each connection guide names the providers / data sources that fill the section and links to (or inlines) the install / connect steps for each.                                                                                                           |
| R-M3  | Each connection guide explains how to **export the data from the external profile** and load it into the app (archive import path).                                                                                                                      |
| R-M4  | Each connection guide explains how to provide **API credentials** for the live API connector to the same provider, in-app.                                                                                                                               |
| R-M5  | The SPA must attempt to connect to a provider API directly from the browser when the user supplies credentials, and detect CORS failures.                                                                                                                |
| R-M6  | When a CORS failure is detected, the SPA must **not** fail silently. It must show in-app instructions on how to start a local server (which will proxy).                                                                                                 |
| R-M7  | The local-server install instructions must live inside the application — the user must not need to leave the SPA (no "see GitHub README" hand-off).                                                                                                      |
| R-M8  | When offline (no local server discovered) the SPA must still try to talk to provider APIs directly. Only when this fails because of CORS does it recommend the server.                                                                                   |
| R-M9  | The SPA must include a **tutorial layer** that walks the user through the key flows step by step.                                                                                                                                                        |
| R-M10 | Each tutorial step must be skippable individually.                                                                                                                                                                                                       |
| R-M11 | The tutorial must be turn-off-able completely (a single off switch).                                                                                                                                                                                     |
| R-M12 | The tutorial must be re-enable-able from the UI at any later time.                                                                                                                                                                                       |
| R-M13 | `docs/REQUIREMENTS.md` must contain all requirements ever recorded — including these — listed without grouping by issue (the grouping is informational; every row appears in the same global list).                                                      |
| R-M14 | A deep case study lives at `docs/case-studies/issue-10/` (this folder), with online research for additional facts and data.                                                                                                                              |
| R-M15 | The case study must enumerate all requirements from the issue.                                                                                                                                                                                           |
| R-M16 | The case study must propose possible solutions and a solution plan for each requirement.                                                                                                                                                                 |
| R-M17 | The case study must check known existing components / libraries that solve a similar problem.                                                                                                                                                            |
| R-M18 | All work must land in a single PR (#11) and iterate until every requirement is fully addressed.                                                                                                                                                          |
