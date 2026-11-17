# Native HH profile persistence

The workspace profile correction now has a native Chromium regression as well
as the five failing-before/passing-after service checks. Four sequential browser
launches use three temporary profiles and a loopback HTTP fixture. A synthetic
HTTP-only cookie has no expiry: after a clean browser close and restart, the
same workspace/slot sends it again. Another slot and another workspace do not.
The fixture removes only its own profiles and closes every browser and socket.
No provider account, password, real cookie or user's running browser is accessed.

The check uses the actual workspace dependency resolver, shared browser factory,
Browser Commander launcher and Chromium disk cookie store. Only the executable
path and container sandbox argument are injected. Browser Commander's existing
persistent-profile behavior preserves session cookies; no additional cookie
copying, migration, plaintext export or browser launch switch is introduced.

The mandatory `jobs-browser-profile` browser group runs this regression on the
Chromium lane. WebKit explicitly reports `unsupportedProfileEngine: webkit`
and zero launches; it cannot verify a Chromium disk profile. The ordinary
three-minute browser-group deadline remains unchanged. The focused local group
passes in 8.3 seconds, with all four launches headless for this cookie check.
The separate resolver tests cover headed defaults and configured overrides.

```sh
E2E_EXECUTABLE_PATH=/usr/bin/google-chrome RUN_BROWSER_E2E=1 \
  node --max-old-space-size=384 js/tests/e2e-jobs-browser-profile-browser.mjs
```

This extends [the shared-profile evidence](jobs-browser-profile.md). It does not
verify interactive login, CAPTCHA handling, copied logins between cases, native
attention reminders or the complete HH01 workflow. Those remain required.
Hosted execution for the new source is pending; PR57 remains draft and unmerged.
