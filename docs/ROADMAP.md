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

## 1. Mobile + Electron polish (R-F3, R-G3)

- [ ] **Electron auto-update.** `electron/main.js` opens the URL but
      doesn't ship updates. Wire `electron-updater` (or the
      `deep-foundation/sdk` equivalent).
- [ ] **iOS build.** Via `deep-foundation/sdk`, or Capacitor as
      fallback if SDK isn't mobile-ready.
- [ ] **Android build.** Same pipeline as iOS.
- [ ] **Mobile-side discovery.** The browser-side autodiscovery
      cascade has to be wired into the WebView shell so the mobile app
      finds a desktop server on the same LAN.

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
