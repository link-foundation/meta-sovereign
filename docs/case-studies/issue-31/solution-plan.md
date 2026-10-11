# Solution Plan

The work was split into atomic commits, each useful on its own.

## 1. Core: detection and planning (`js/src/crm/`)

- `address-form.js` — the rule table (`defaultAddressRules`), the
  scorer (`scoreAddressForm`), the dialog verdict
  (`detectAddressForm`) and user rules from `pattern:*` links
  (`addressRulesFromPatterns`).
  - Word boundaries are built from `[\p{L}\p{M}\p{N}_]` look-arounds,
    because `\b` only knows ASCII letters and would match "ты" inside
    "работы".
  - Weak markers (greetings, imperatives) weigh 0.5, pronouns and verbs
    weigh 1, the owner's messages count twice.
- `reengage.js` — `findDormantContacts`, `planReengagement`,
  `prefillLinkFor`, `buildReengageRecord`, `createAdapterSender` and
  `createReengageSession` (modes `safe` (default, alias `debug`) and
  `batch`).
  - Chat kind comes from the adapter's `chatType` when present, else
    from VK peer id ranges; `buildMessageLink` now carries the optional
    `chatType`, `chatName` and `senderName` the Telegram export already
    had.
  - Records double as the cooldown: a contact with a `reengage:*`
    record younger than the threshold is listed under `excluded` with a
    reason instead of being drafted again.

## 2. CLI (`js/src/cli/reengage-commands.js`)

- `reengage` previews the plan (or `--json`).
- `--interactive` walks the safe session with prompts; tests inject
  `ask` and `send`.
- `--mode=batch` refuses to run without `--confirm=true`; the exit code
  is 1 when any send failed.

## 3. HTTP (`js/src/server/routes-reengage.js`)

- `/plan` over everything the server holds; `/send` one draft with
  `confirm: true`; `/mark` records `sent` or `skipped`; `/run` sends a
  whole plan only in batch mode with confirmation. A send failure is a
  502 with the error, and is recorded as `failed`.
- `startServer({ reengage: { send } })` replaces the adapters in tests
  and in the screenshot experiment.

## 4. SPA (`js/src/web/reengage-view.js`)

- `ReengageScreen` is pure (state → markup) so it is tested with
  `renderToStaticMarkup` in all four locales; `ReengageView` owns the
  state and the effects.
- The plan comes from `/api/reengage/plan` when the server is reachable
  and from the local links otherwise; Mark / Skip are ordinary link
  writes; only Send needs the server (`code: 'server-required'`
  otherwise).
- Safe mode is a checkbox, on by default; turning it off reveals
  "Send all (n)", which asks once before sending.

## 5. Documentation

- `docs/REQUIREMENTS*.md` section W, `docs/USER-GUIDE*.md` section 10,
  `docs/SERVER-PARITY*.md` section 5a, in en/ru/zh/hi.
- This case study with screenshots and raw issue / PR data.

## Testing

| Test file                          | What it covers                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `js/tests/address-form.test.js`    | markers, false-positive collisions, owner weighting, tie / no-evidence fallback, zh / hi, user pattern rules       |
| `js/tests/reengage.test.js`        | dormant detection, chat kinds, self detection, templates, prefill links, cooldown records, safe vs. batch sessions |
| `js/tests/reengage-cli.test.js`    | preview, interactive keys, batch without / with confirmation                                                       |
| `js/tests/reengage-server.test.js` | plan, confirm-required, 502 on failure, mark, batch-only run, 405                                                  |
| `js/tests/reengage-web.test.js`    | the screen's markup in every locale, safe-mode switch, notices, offline send                                       |

## Alternatives Considered

- **A PEG grammar for Russian sentences.** Rejected: the verdict needs
  marker counts, not parse trees, and a grammar would be much harder
  for a user to extend than a table of regexes.
- **Using the contact's messages only.** Rejected: the owner's own
  usage is the best predictor of how the owner should write now, so it
  is weighted higher, but the contact's messages still count when the
  owner never used a marker.
- **Batch sending by default.** Rejected by the issue's safety
  requirement; batch exists but always needs an explicit confirmation.
