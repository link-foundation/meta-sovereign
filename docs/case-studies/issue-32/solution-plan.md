# Issue 32 Solution Plan

## Problem statement

meta-sovereign's VK live connector needs a user token with `messages`
(for `messages.getConversations`, `messages.getHistory` and
`messages.send`). Users obtained one by borrowing Kate Mobile's
client_id through vkhost.github.io. That stopped working on 2026-09-08.
The issue asks which vkhost clients still work, with a bias towards
trusted publishers.

## Root cause

The Kate ban is the last step of a longer policy:

1. VK closed `messages` to new apps (the moderation path was closed in
   June 2024).
2. VK disabled the user-token flows for new apps (June 2024).
3. VK started blocking individual legacy client_ids that scripts abused
   (VK Admin in April 2026).
4. VK capped every business account's monthly calls (September 2026),
   which ended Kate.

No application "has" the rights in a way that can be transferred. What
remains is a shrinking set of legacy client_ids that VK has not blocked
yet.

## Options considered

| Option                                                           | Verdict                                                                                                                                                                         |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Hard-code a new borrowed client_id (e.g. 6287487) as default. | Rejected. It silently exposes every user to freeze risk and to a grey ToS area. It would break again on VK's next block, and the code would not tell anyone why.                |
| B. Register an own app and ask VK for `messages`.                | Not possible: «Для новых приложений это право не выдаётся» ("this right is not granted to new applications"). Support answers "exceptional cases only" (see external research). |
| C. Move to VK ID OAuth 2.1 (`id.vk.ru`).                         | Insufficient: new apps get only `vkid.personal_info`, `email` and `phone`. Useful later for profile sync, not for messages.                                                     |
| D. Community token + Bots Long Poll / Callback API.              | Official and durable, but limited to communities the user administers. Documented in the hint as the official live route.                                                       |
| E. Archive import (`vk.com/data_protection`).                    | Official, complete history, already implemented. Stays the first recommendation.                                                                                                |
| F. Ship the research as data + tools, keep the user in control.  | **Chosen.** A ranked, dated catalogue; a probe to refresh it; an inspector to check a token the user already has; corrected in-app guidance. Nothing is borrowed silently.      |

## Implementation steps

1. Archive every source (`data/`) and write an unauthenticated OAuth gate
   probe with controls (`experiments/issue-32/`).
2. `js/src/sources/vk-auth.js`:
   - catalogue and ranking;
   - gate classifier and probe;
   - scope decoder;
   - error hints;
   - `inspectVkToken`.
3. `js/src/sources/vk.js`:
   - default to `api.vk.ru`;
   - expose `call` so the inspector reuses the connector's request code;
   - tag errors with `vkCode`.
4. Rewrite the VK connection guide and its four locale strings, then
   rebuild `app.min.js`.
5. Add tests (`js/tests/vk-auth.test.js`), an example
   (`examples/vk-token-check.mjs`), requirements section W and a
   changeset.

## Verification

- `npm test`: the new suite covers every gate outcome seen live, the
  catalogue invariants (every vkhost id present, no non-login-page entry
  recommended, Kate unavailable), the ranking order, the bitmask, the
  error hints, and four token verdicts.
- The live probe ran on both OAuth hosts, before and after the classifier
  moved into the library, with identical output.
- The token checker ran against the real api.vk.ru (bogus token → error 5
  plus hint).
- lint, format:check and jscpd all pass.
