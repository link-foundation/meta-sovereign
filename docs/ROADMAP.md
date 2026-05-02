# Roadmap

This document tracks every requirement from
[`REQUIREMENTS.md`](./REQUIREMENTS.md) that is **not yet** fully
implemented. The maintainer's directive on PR #2 is explicit: iterate
until this file is empty.

When a roadmap item lands, remove it from this file and update the
corresponding row in `REQUIREMENTS.md` from "Skeleton/Partial" to
"Done". Add a one-line entry to the relevant changeset section so the
release notes stay accurate.

The items are grouped by where the work lives. Within each group items
are listed in rough priority order (highest first).

---

## 1. External-service connectors (R-E1 … R-E9)

Live API integration is missing for every network. The archive parsers
in `src/sources/` already produce normalised `Link` objects, but the
live read/write side needs to call out to each service.

- [ ] **Telegram (R-E2).** Wire `konard/telegram-bot` so the SPA can
      read/send DMs in real time. Token storage uses the universal store
      with a `secret:*` key prefix and is never shipped to peers.
- [ ] **VK (R-E1).** Wire `konard/vk-bot` for messaging and
      `konard/vk-export` for backfill.
- [ ] **WhatsApp (R-E4).** WhatsApp Cloud API for opted-in flows;
      fall back to per-chat export ingestion otherwise.
- [ ] **X (R-E3).** Outbound via `konard/broadcast`; inbound via
      archive import is already done.
- [ ] **Facebook / LinkedIn (R-E5, R-E6).** API-side import/export.
- [ ] **hh.ru / habr-career / superjob (R-E7, R-E8, R-E9).** Resume
  - applications sync.

Every connector must emit a `handled: { at, by }` stamp on every link
it produces so peer sync does not re-fire its handler (R-J5).

## 2. UI quality and design audit (R-G1, R-H1)

- [ ] **React port of the SPA (R-G1).** The SPA is currently vanilla
      JS for simplicity; the issue specifies React. Port view by view
      while keeping the offline client and discovery cascade unchanged.
- [ ] **Apple HIG / Material / Microsoft audit (R-H1).** Document one
      checklist per surface (chat, operator, contacts, automation graph,
      patterns, broadcast, settings) and resolve every gap.
- [ ] **Dark mode toggle.** Currently follows the system theme via
      CSS only.
- [ ] **Accessibility pass.** Run axe-core in the
      `browser-commander` e2e suite; fix every error.

## 3. Mobile + Electron polish (R-F3, R-G3)

- [ ] **Electron auto-update.** `electron/main.js` opens the URL but
      doesn't ship updates. Wire `electron-updater` (or the
      `deep-foundation/sdk` equivalent).
- [ ] **iOS build.** Via `deep-foundation/sdk`, or Capacitor as
      fallback if SDK isn't mobile-ready.
- [ ] **Android build.** Same pipeline as iOS.
- [ ] **Mobile-side discovery.** The browser-side autodiscovery
      cascade has to be wired into the WebView shell so the mobile app
      finds a desktop server on the same LAN.

## 4. End-to-end testing (R-H4, R-J7)

`tests/e2e-browser-spa.mjs` (opt-in via `RUN_BROWSER_E2E=1 npm run
test:e2e:browser`) now drives the SPA in headless Chromium through
`browser-commander` + Playwright. It covers the reachable critical
paths (boot → write → reload survives; click every nav view; pattern
infer → save; automation graph build; broadcast emits per-network
envelopes). The remaining scenarios need infrastructure that doesn't
yet exist (real network credentials, two coordinated browsers, restore
flow): we'll close them as the underlying features land.

- [ ] **Two-browser WebRTC convergence.** Boot two SPA instances,
      connect over WebRTC, mutate in browser A, observe in browser B.
      Needs `browser-commander` extended to drive two pages in lockstep.
- [ ] **Real Telegram archive import.** Configure a Telegram archive,
      run import, see chats in the unified UI. Blocked on the
      Telegram connector landing (see §1).
- [ ] **Audience → mass-personal outreach.** Define an audience
      query, kick off outreach, observe one envelope per
      (contact × network). Mostly a UI surfacing task — endpoints
      already exist.
- [ ] **Profile-sync envelopes.** Edit profile → trigger profile
      sync → verify per-network envelopes.
- [ ] **Backup → restore round-trip.** Trigger a backup → restore
      from it → store reaches identical state. Already unit-tested in
      `tests/backup.test.js`; need the UI flow.
- [ ] **Re-run e2e against the Rust server.** Add a second invocation
      of `tests/e2e-browser-spa.mjs` that boots `meta-sovereign-rs serve
--web ./src/web` instead of the JS server.

## 5. Browser-side WASM stack (R-G1)

- [ ] **`doublets-web` integration.** Add a `BrowserStore` driver
      backed by `doublets-web` (WASM) so the browser-side database can
      share the binary store format with the server.
- [ ] **WASM pattern matcher.** Compile the Rust `pattern_matches`
      port to WASM and run it in the SPA so heavy-pattern UIs don't
      block the main thread.

## 6. Live-API documentation surface (R-H3)

- [ ] **`docs/api/` autogeneration on CI.** `npm run docs:api` is in
      place; wire it into the release workflow so the published artefact
      always carries fresh docs.
- [ ] **`cargo doc --no-deps`** publish for the Rust crates on every
      release.

## 8. Security hardening

- [ ] **WebRTC TURN fallback.** Document how to point the SPA at a
      user-hosted `coturn` for cross-NAT sync.

---

## How to close items

1. Open a commit on `issue-1-fc41adad29ce` (this PR's branch) that
   addresses one or more checkboxes.
2. Update `REQUIREMENTS.md` so the affected `R-*` row reads "Done".
3. Remove the checkbox from this file. If the section is now empty,
   delete the section heading too.
4. Add a one-liner to the changeset under the appropriate iteration
   section so the release notes mention it.

When the file is empty, delete it — that signals the v0.0.1 vision is
fully realised.
