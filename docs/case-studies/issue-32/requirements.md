# Issue 32 Requirements Matrix

Each row maps one sentence of the issue to the requirement ids tracked
in [`docs/REQUIREMENTS.md`](../../REQUIREMENTS.md) section W, and to the
evidence that satisfies it.

## Direct requirements

| Requirement (issue wording)                                                                                                   | Ids        | Status | Evidence                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Based on https://vkhost.github.io we must research **which applications still have elevated permissions** like kate mobile." | R-W1       | Done   | All 15 vkhost client_ids probed with `scope=messages,offline` (`experiments/issue-32/probe-vk-oauth-apps.mjs`, `verification-logs/oauth-probe*.txt`); results plus community evidence in the [README table](./README.md#ranked-answer). |
| "…so we have **something we can reuse** after kate mobile was banned."                                                        | R-W2, R-W3 | Done   | `VK_TOKEN_SOURCES` / `rankVkTokenSources()` give a ranked, dated list; `inspectVkToken()` checks a real token; `examples/vk-token-check.mjs` wraps both for the terminal.                                                               |
| "We must use also **other trusted sources**."                                                                                 | —          | Done   | Official dev.vk.ru docs and platform rules, press coverage, the vkhost tracker and first-hand community threads, all archived under `data/` and quoted in [external-research.md](./external-research.md).                               |
| "…**reduce probability of using untrusted and small applications**, that may use our personal data in unintended ways."       | R-W2       | Done   | VK-owned clients always rank first; `rankVkTokenSources()` leaves third-party clients out unless `includeThirdParty: true`; the in-app hint names only VK's own web client.                                                             |

## Derived requirements

| Requirement                                                                    | Ids  | Status | Evidence                                                                                                                                                       |
| ------------------------------------------------------------------------------ | ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Do not keep telling users to follow a path VK closed in 2024.                  | R-W4 | Done   | `connections.vk.api.hint` rewritten in en/ru/zh/hi and `connection-guides.js`; `app.min.js` rebuilt.                                                           |
| The in-app hint must name the secret id the field actually stores.             | R-W4 | Done   | The hint now says `secret:vk:access-token`, matching `fields[0].secretId`.                                                                                     |
| Follow VK's domain move so the connector keeps working when vk.com is retired. | R-W5 | Done   | `VK_API_BASE = 'https://api.vk.ru'` in `js/src/sources/vk.js`; guide `apiBase` / `probeUrl` / `docsUrl` on vk.ru; test `VK live adapter defaults (issue #32)`. |
| Never send credentials to anyone but VK, and never log them.                   | R-W3 | Done   | `probeVkOAuthGate` sends no token and no cookie (asserted in tests); `inspectVkToken` talks only to the VK API host and returns no token.                      |
| The research must be re-runnable when VK changes something.                    | R-W1 | Done   | The probe script and `probeVkOAuthGate()` share one classifier; `VK_TOKEN_SOURCES_PROBED_AT` dates the catalogue.                                              |

## Out of scope

- Logging in to VK with a real account, or storing a borrowed token by
  default. Both carry account-freeze risk for whoever runs them.
- Switching meta-sovereign to VK ID OAuth 2.1. It cannot grant
  `messages` to new apps.
