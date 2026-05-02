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

Telegram now has a Bot API live connector and a real Telegram Desktop
archive parser. The remaining archive parsers in `src/sources/`
already produce normalised `Link` objects, but their live read/write
side still needs to call out to each service.

- [ ] **VK (R-E1).** Wire `konard/vk-bot` for messaging and
      `konard/vk-export` for backfill.
- [ ] **WhatsApp (R-E4).** WhatsApp Cloud API for opted-in flows;
      fall back to per-chat export ingestion otherwise.
- [ ] **X (R-E3).** Outbound via `konard/broadcast`; inbound via
      archive import is already done.
- [ ] **Facebook / LinkedIn (R-E5, R-E6).** API-side import/export.
- [ ] **hh.ru / habr-career / superjob (R-E7, R-E8, R-E9).** Resume
      applications sync.

Every connector must emit a `handled: { at, by }` stamp on every link
it produces so peer sync does not re-fire its handler (R-J5). Telegram
already does this via `pullLiveInto()`.

## 2. UI stack (R-G1)

- [ ] **React port of the SPA (R-G1).** The SPA is currently vanilla
      JS for simplicity; the issue specifies React. Port view by view
      while keeping the offline client and discovery cascade unchanged.

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

## 4. Browser-side WASM stack (R-G1)

- [ ] **`doublets-web` integration.** Add a `BrowserStore` driver
      backed by `doublets-web` (WASM) so the browser-side database can
      share the binary store format with the server.
- [ ] **WASM pattern matcher.** Compile the Rust `pattern_matches`
      port to WASM and run it in the SPA so heavy-pattern UIs don't
      block the main thread.

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
