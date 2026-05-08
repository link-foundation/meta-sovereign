# Solution Plan

## Alternatives Considered

### Option A: Keep Inline Cards, Collapse Them

This would reduce visual height but keep the same duplicated UI ownership.
Every data page would still need credential/import/probe behavior, so fixes
would continue to fan out across empty states.

Decision: rejected.

### Option B: Rename Settings To Connections

This would preserve the old component ownership but would not solve the
dedicated provider-detail requirement. It would also make Settings lose its
app-level role.

Decision: rejected.

### Option C: Connections Owns Provider Setup

Connections already had the provider list/detail structure from PR 26. Moving
the operational controls there makes the UI match the issue wording:

```text
data section -> Connections -> provider detail
```

This keeps data pages lightweight, avoids duplicated controls, and preserves
all provider instructions and existing functionality.

Decision: implemented.

## Implementation Steps

1. Add failing tests:
   - `ConnectionGuide` must render a compact Connections CTA.
   - `ConnectionGuide` must not render provider setup cards, archive import,
     or probe controls inline.
   - `ConnectionDetail` must render credential inputs, archive import, and
     direct probe controls.
2. Move provider setup controls:
   - Credential saving and forgetting.
   - Archive file/paste import.
   - Direct API probe and CORS help.
3. Update navigation:
   - Empty-state CTAs dispatch `view: "connections"`.
   - Connections reads `#conn-{provider}` on first render and hash changes.
   - Provider detail Back clears the connection hash.
4. Update Settings:
   - Keep Settings as app-level preferences.
   - Add a button to open Connections.
5. Update localization:
   - Data empty-state bodies now point to Connections.
   - Settings copy no longer claims provider controls live there.
6. Verify:
   - Focused tests.
   - Full tests, lint, formatting, duplication check, web build.
   - Browser screenshot of the final Connections detail.

## Regression Risks

- Provider credentials are pulled from `api.links()` now threaded through
  `ConnectionsView`; stale state after save/delete would make the probe button
  incorrect. Mitigation: provider controls call `refresh()` after save/delete.
- Hash navigation could leave the user in a provider detail after pressing
  Back. Mitigation: Back clears `#conn-{provider}` with `history.replaceState`.
- E2E tests previously clicked Settings. Mitigation: browser e2e now goes
  through Connections and the data-page CTA.

## Debugging Notes

No persistent debug output was added. The root cause was directly reproduced
with render tests and code inspection. Existing `data-*` selectors now cover
the issue 27 contract and should be enough for future browser debugging.
