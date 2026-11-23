# HeadHunter application verification across views

The pinned notifier brings forward the browser that is waiting for its owner and offers repeat reminders. The published parent could latch the HeadHunter application verification hold while Settings showed no notice and the application console offered no way to focus that exact wait. [Pinned notifier](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/src/notify.mjs) · [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

The app shell now shows an active HeadHunter verification wait in any view. **Show browser** focuses the exact live owned page when a visible window is available. **Later** defers that notice for fifteen minutes. The foreground application console offers `attention` and `focus <wait-id>`. Both Lino encodings support the same receipt. The read rechecks verification markers, including visible child frames, and the focus request must match the active wait, request and slot. Neither command reads or fills the answer control, issues an application command or writes the journal. After manual completion the notice clears. The existing application hold still governs any later attempt to send.

## Reproduction and verification

Enter the synthetic HeadHunter application form in the `interview` slot, show the fixture verification gate and read the application. Navigate to Settings at 390 pixels. The production bundle at `2396293e` has no banner and returns HTTP 404 for the attention read. The revised bundle shows the banner and focuses the exact named browser. Removing the gate clears the notice. Repeat with a gate in a visible child frame, then close the review to clear that notice. [Browser regression](../../../js/tests/helpers/e2e-application-attention.mjs).

```sh
node --test --test-concurrency=1 js/tests/job-application-attention.test.js js/tests/job-application-holds.test.js js/tests/job-application-hold-controls.test.js js/tests/forms-attention.test.js js/tests/i18n.test.js js/tests/hh-captcha-boundaries.test.js
deno test --no-check -A js/tests/job-application-attention.test.js js/tests/job-application-holds.test.js js/tests/job-application-hold-controls.test.js js/tests/forms-attention.test.js js/tests/i18n.test.js js/tests/hh-captcha-boundaries.test.js
RUN_BROWSER_E2E=1 HH_ATTENTION_ONLY=1 node js/tests/e2e-job-application-attention-browser.mjs
```

- Seven focused regressions fail on the parent. The revised checks cover the live receipt, exact identity, headless focus refusal, expiry, close races, no journal writes, both Lino encodings and the existing origin check. [Focused regression](../../../js/tests/job-application-attention.test.js).
- Production Chromium verified the main-document and nested gates, one exact focus, zero challenge-answer reads, zero provider submissions and closure. The fixture advertises the visible-window capability while the Chromium harness runs headless. The focus spy delegates to Playwright's real page focus action.
- Independent Playwright MCP verified focus at 390 pixels, persistence from Settings to Operator, no horizontal overflow, removal after owner verification and zero uncaught page errors. Its fixture recorded one focus, zero challenge-answer reads, zero submissions and a closed review. The console logged missing optional Telegram routes and favicon, a cache write failure, an event-stream disconnect at shutdown and a Content Security Policy rejection of the existing shared chime's blob URL. [Fixture](../../../experiments/issue-56/application-attention-mcp-server.mjs).

![Settings on the previous production bundle during a HeadHunter verification wait](../../screenshots/issue-56-hh-attention-before.png)

![Settings retains the active HeadHunter verification notice and focus control](../../screenshots/issue-56-hh-attention-after.png)

Manual login, native desktop alerts while the app is closed and authenticated provider verification remain required. HH01 and QA24 remain open. [Evidence archive](data/hh-application-attention.tar.gz) · [Per-file checksums](data/hh-application-attention.tar.sha256.json).

## Play the notification chime through the production policy

Enable notification sound, disable system notifications, interact with Settings, then make the synthetic HeadHunter browser wait for its owner. The parent at `90579d1a` creates a blob URL that the production `media-src` directive blocks. Its real audio element reports media error 4. The browser alert falls silent even though its in-app controls still work.

The shared player now uses the same two-note chime as a same-origin PCM asset. The local server serves it as `audio/wav`, and Pages, desktop and mobile stage the same file. The existing media policy and chat ringtone selections are preserved. A playback refusal now reports `none` to the caller. [Player](../../../js/src/web/notify-sound.js) · [Browser regression](../../../js/tests/helpers/e2e-application-attention-chime.mjs).

- Chromium reports `canplay` and `playing` with a duration of 0.36 seconds and system notifications disabled. Independent Playwright MCP at 390 pixels records `ended`, retains the active notice and records zero private answer reads and zero submissions in the owned fixture. The console records missing optional Telegram routes and favicon, a cache write failure and an event-stream disconnect at shutdown.
- Node and Deno each pass 50 focused sound, Forms, HeadHunter and media-policy checks. Eight focused Pages and desktop packaging checks pass. Separate mobile and desktop staging runs preserve the asset byte for byte. The existing Chromium sound scenario still retrieves a configured ringtone and plays the default chime.

```sh
RUN_BROWSER_E2E=1 HH_ATTENTION_CHIME_ONLY=1 node js/tests/e2e-job-application-attention-browser.mjs
RUN_BROWSER_E2E=1 node js/tests/e2e-sounds-browser.mjs
node --test --test-concurrency=1 js/tests/build-pages.test.js js/tests/desktop-security-override.test.js
```

Playback tests observe the browser media element after operator interaction. Platform system sounds and alerts with a closed desktop window still require verification. [Evidence archive](data/notification-chime.tar.gz) · [Per-file checksums](data/notification-chime.tar.sha256.json).

## Browser CI coverage

The hosted contract on `580a2012` reported four policy scenarios missing. The registration scanner saw only the first of three conditional arrays, while the normal entry actually ran six checks and exceeded the four-scenario limit. Both attention scenarios now have their own mandatory browser entry. The four policy checks keep their existing entry. Chromium and WebKit retain the same shard counts and deadlines. The focused contract suite passed 32 checks, and the new Chromium entry exercised the main and nested verification gates, exact browser focus, and the audible chime. [Hosted failure, log lines 653–680](https://github.com/link-foundation/meta-sovereign/actions/runs/45167662299/job/137670167026#step:15:111) · [Registration contract](../../../js/tests/ci-browser-shards.test.js).
