# Solution plan — issue #16

This file maps every `R-O*` row from
[`requirements.md`](./requirements.md) to one or more concrete
deliverables in PR #17. The phases are ordered so the PR is
reviewable in slices: the data layer lands first, then the UI, then
the tests.

## Phase 1 — Probe URL templates (R-O1, R-O2)

- Extend each entry in `providerCatalogue` (`js/src/web/connection-guides.js`)
  with a `probeUrlTemplate` field — a string that interpolates `{token}`
  and (where applicable) `{phoneNumberId}`, `{appId}`. Existing
  `probeUrl` becomes a derived value when no credentials exist; for
  providers that cannot probe without a token, the derived value is
  `null` and the UI surfaces "Enter a token to enable probe" instead
  of firing a request that is guaranteed to fail.
- Add `buildProbeUrl({ provider, credentials })` in the same module.
  Pure function — covered by unit tests.
- Update `tryDirect`'s callers to pass the resolved URL.

## Phase 2 — Settings nav surface (R-O6)

- Add `'settings'` to `js/src/web/nav-items.js` and to
  `js/src/web/index.html`'s nav.
- Add `views.settings` in `js/src/web/views.js`. The view renders one
  card per provider in `providerCatalogue`, anchored by
  `id="conn-{provider}"` so per-section CTAs can deep-link.

## Phase 3 — Credential inputs (R-O3, R-O8, R-O9)

- New `<ProviderCredentialsForm>` component
  (`js/src/web/provider-credentials-form.js`):
  - Reads existing `secret:*` links via `api.get` on mount.
  - Renders one row per credential field with appropriate `type`.
  - On submit, writes one `secret:*` link per field via
    `wrapSecretStore`-wrapped store.
  - Shows a "Forget" button that deletes the link.
- Server route (`js/src/server/index.js`) already serves `/links/:id`
  for `PUT`/`GET`/`DELETE`; the SPA reuses it via `dom.js → api`.

## Phase 4 — File upload + paste textarea (R-O4, R-O5)

- New `<ProviderArchiveImport>` component
  (`js/src/web/provider-archive-import.js`):
  - `<input type="file" accept=".json,.zip,.txt">` reads via `text()`
    or `arrayBuffer()`.
  - `<textarea>` fallback for paste.
  - Calls the appropriate `parseArchive` from `js/src/sources/`.
  - On success, batches `api.put` for each parsed link.
- Settings card composes both `<ProviderCredentialsForm>` and
  `<ProviderArchiveImport>` inside one section per provider.

## Phase 5 — Per-section "Connect first" CTA (R-O7)

- Add a `connectFirst` field to every guide entry in
  `connectionGuides` (`{ providerId, sectionId }`).
- Update `<ConnectionGuide>` to render a prominent
  "Open Settings → Connections → {provider}" button that fires
  `setView('settings')` and scrolls to `#conn-{provider}`.

## Phase 6 — Persisted credentials feed the probe (R-O1, R-O2, R-O8)

- `<ProbeRow>` reads the persisted `secret:*` credential, calls
  `buildProbeUrl`, and runs `tryDirect`. The probe URL is no longer
  hard-coded.
- The `secret:*` filter in the sync layer is left untouched; a new
  sync test re-asserts that even with a settings-entered token the
  link does not propagate.

## Phase 7 — Probe outcome remediation (R-O10)

- The status badge maps:
  - `ok` → green "Connected as {body.username}".
  - `http` → yellow "API returned {status}" + provider-specific hint
    from `providerCatalogue[provider].apiCredentials.errorHints`.
  - `cors` → red + render `<LocalServerHelp>` (existing component) —
    issue #10 contract preserved.
  - `network` → yellow "Network error" + retry button.

## Phase 8 — Tests (R-O11, R-O12, R-O13, R-O14)

- **Unit:** new `js/tests/connection-guides-templates.test.js` —
  asserts `buildProbeUrl` for every provider, asserts no template
  matches the broken legacy URLs.
- **Integration:** new `js/tests/settings-credentials-roundtrip.test.js` —
  boots `startServer` with `secretPassphrase`, writes a fake token via
  the SPA's `api.put`, asserts the on-disk `data.lino` does **not**
  contain the plaintext.
- **Sync:** extend `secret-store.test.js` with a case that adds a
  Telegram bot token via the Settings code path and asserts peer B
  never sees it.
- **e2e local:** new `js/tests/e2e-settings-local.mjs` — uses
  Playwright + the existing `e2e-browser-spa.mjs` harness; opens
  `/`, clicks "Settings", types `999:fake` into the Telegram input,
  clicks "Try directly", asserts the badge text is one of
  `Connected`, `API returned 401`, `CORS blocked`, or
  `Network error` — never the literal `404` or `400` shape from the
  bug.
- **e2e Pages:** new `js/tests/e2e-settings-pages.mjs` — runs in a
  separate CI job after `pages.yml` finishes, navigates to the
  deployed URL, asserts Settings renders and the no-credential probe
  shows the "Enter a token to enable probe" placeholder.

## Phase 9 — Docs & changeset (R-O15, R-O16, R-O17, R-O18, R-O19)

- This case study (already present).
- Append section **O. Provider connection settings (issue #16)** to
  `docs/REQUIREMENTS.md` mirroring the `R-O*` rows.
- Add `.changeset/issue-16-provider-connections.md` with a `'meta-sovereign': minor` entry summarising R-O1..R-O19.

## Out of scope (deferred)

- Full ZIP unpacking of Facebook DYI exports (MVP accepts inner JSON).
- OAuth dance flows (the SPA only stores tokens the user pastes; no
  redirect URIs, no PKCE). A future issue covers in-browser OAuth.
- A unified credential rotation policy. The "Forget" button deletes a
  token but no expiry tracking is added.

Each deferred item will be filed as a follow-up issue once PR #17
ships, with the relevant `R-O*` row referenced.
