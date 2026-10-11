---
'meta-sovereign': minor
---

R-W1..R-W5: VK token sources after the Kate Mobile ban. VK no longer
grants the user `messages` right to new applications, and Kate Mobile's
client_id has answered "Flood control" since 2026-09-08. A new
`js/src/sources/vk-auth.js` module (also exported as
`meta-sovereign/sources/vk-auth`) turns the issue-32 research into code:

- `VK_TOKEN_SOURCES` and `rankVkTokenSources()` cover every
  vkhost.github.io client plus VK's native apps. Each entry carries its
  publisher, its OAuth-gate result on 2026-10-11 and dated community
  evidence. VK-owned clients rank first (vk.com 6287487, then VK Calls
  7793118). Third-party clients are left out unless explicitly requested.
- `classifyVkOAuthGate()` / `probeVkOAuthGate()` re-run the
  unauthenticated `messages,offline` gate probe
  (`experiments/issue-32/probe-vk-oauth-apps.mjs`).
- `inspectVkToken()` makes three read-only calls to say whether a token
  the user already holds is invalid, a community token, or can or cannot
  read messages. `describeVkError()` explains VK error codes.
  `examples/vk-token-check.mjs` wraps both.

The VK connection guide (all four locales) no longer suggests creating a
Standalone app with the messages scope. It points to the archive import,
community tokens and, at the user's own risk, VK's own web client, and it
names the real secret id `secret:vk:access-token`. The VK connector and
guide now use the `vk.ru` domain (`api.vk.ru`, `dev.vk.ru`), and VK API
errors carry `error.vkCode`. Research and evidence:
`docs/case-studies/issue-32/`.
