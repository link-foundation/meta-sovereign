# Finite Electron authorization entry readiness

The native authorization step on `c4b904c3` remained in progress from
21:05 UTC on 2026-11-15 while other desktop architectures completed. Its ESM
entry awaited `app.whenReady()` at top level. Electron 45.2.3's
[`lib/browser/init.ts`](https://github.com/electron/electron/blob/v45.2.3/lib/browser/init.ts#L109)
awaits the entry import before calling `appCodeLoaded()`. Electron's
[ESM documentation](https://www.electronjs.org/docs/latest/tutorial/esm)
also explains that entry evaluation precedes readiness. This establishes a
readiness cycle in the fixture, rather than a reason to extend its timeout.
The production desktop entry already starts its async lifecycle without
top-level awaiting it and is unchanged.

The finite Node experiment models that exact ordering: it resolves mocked
Electron readiness only after the actual entry module finishes evaluating.
Against the parent source it records `evaluated: false`, `readyRequested: true`
and `readiness-cycle`, then terminates after one second. With the corrected
entry it records `evaluated: true` and reaches a deliberately refusing window
constructor. That refusal is the probe's expected observation, not a passing
native-window result. Temporary profiles are removed in both cases.

The native entry now configures its private profile synchronously, launches
the async check without linking it to module evaluation, and keeps the
15-second abort deadline. A second two-second deadline terminates the fixture
if readiness or cleanup cannot drain. A separate finite case accelerates
only these two fixture timers and deliberately withholds readiness; it proves
that the terminating deadline is reachable. Neither case starts Electron,
contacts VK or operates the user's server locally.

Run `node --test js/tests/vk-token-electron-entry.test.js` for the regression;
the focused nine-test entry/authorization group passes. Real Electron remains
the existing hosted Linux x64 step's responsibility. This correction does not
establish that hosted result, live VK authorization, kernel sandbox enforcement
or completion of VD13 or issue #56. PR57 stays draft and unmerged.

Evidence: [archive](data/vk-token-electron-entry.tar.gz),
[hash manifest](data/vk-token-electron-entry.tar.sha256.json).
