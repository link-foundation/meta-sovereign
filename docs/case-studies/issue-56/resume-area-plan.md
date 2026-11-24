# Saved HH area identities

This unit advances HH18/HH21 in [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
All 60 incomplete inventory rows remain required.

- [x] Reuse the existing complete, bounded official area directory and localized
      cache for native downloads and independent saved readback. Fetch only when
      a job has a city; unknown and ambiguous labels must refuse confirmation.
- [x] Preserve verified `areaId` alongside the original city label, industry
      IDs/labels, archived website path, descriptions, About and inventories in
      structured, Lino and derived exports. Keep older documents without IDs
      readable without inventing an identity or changing their shape.
- [x] Verify localized saved cities by official ID, require exact industry sets,
      and reject a native preparation source whose supplied area ID contradicts
      the verified dictionary. Never treat these reads as provider mutation.
- [ ] Preserve parent-failing regression, focused conversion/verification and
      existing native browser checks; review exact-head CI before accepting this
      unit. The parent fails the area round-trip regression. Focused checks pass
      34 cases and compatibility checks pass 43 (overlapping groups); all ten
      isolated Chromium cases pass. Strict lint, formatting, build, secrets and
      the unchanged 6.5% duplication gate pass. Hosted acceptance is pending.

Authenticated acquisition, newly created/hidden native records, native sync
additions and updates, individually confirmed Saves, specific owner-requested
CV edits and all other incomplete inventory criteria remain unfinished.
