# Keep the foreground Forms console responsive

`forms-review` waits for the owner to finish a CAPTCHA before prefill can continue. The previous command awaited that result before looking at input. This affected both `--prefill` during startup and `prefill <slot>` after opening a form. The owner could see a wait receipt but could only use `list` or `focus` after the wait ended. [Pinned Show browser behavior](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/src/notify.mjs) · [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

The foreground CLI now resumes command input when the original prefill emits the owner-wait receipt. `list` includes the current attention receipt. `focus <slot> <request-id>` uses the same exact-request guard as the app notice. `focus <slot>` still works for an explicitly selected session. The CLI awaits the owned task's final receipt directly. Startup still processes its requested forms in order and permits commands early when owner verification is needed.

`close <slot>`, `quit` and end of input drain pending verification work. The last two retain existing detachment behavior for other idle durable learning watchers. A completed wait resumes the original prefill with its original request ID. [Console implementation](../../../js/src/cli/forms-review-commands.js) · [Original task observer](../../../js/src/cli/forms-prefill-wait.js).

## Reproduction and verification

Open a fixture form whose visible browser is waiting for owner verification. Start `forms-review --prefill <url>` or enter `prefill form-1` at its prompt. While the form is waiting, enter `list`, try `focus form-1 stale-request`, then use the actual request ID in the focus command. Release the synthetic verification and read the terminal prefill receipt. In separate runs, close the slot, quit or end input before release. [Focused regressions](../../../js/tests/forms-attention.test.js).

```sh
node --test --test-concurrency=1 js/tests/forms-attention.test.js js/tests/forms-auto-prefill.test.js js/tests/forms-review-sessions.test.js js/tests/forms-review-prefill.test.js js/tests/forms-monitor.test.js js/tests/forms-markdown.test.js js/tests/forms-captcha.test.js
deno test --no-check -A js/tests/forms-attention.test.js js/tests/forms-auto-prefill.test.js js/tests/forms-review-sessions.test.js js/tests/forms-review-prefill.test.js js/tests/forms-monitor.test.js js/tests/forms-markdown.test.js js/tests/forms-captcha.test.js
```

The regression uses the real foreground command and shared review service with a synthetic form and an instrumented browser. Both prefill entry points expose the wait before release, reject the stale request and issue exactly one focus call. The original request makes two allowed fixture writes after release and records no submission attempt. Close, quit and end of input each produce one browser close and zero writes while the fixture challenge is still active. The original completion test verifies one start and records its waiting and terminal receipts.

All five new regressions fail on the published parent `c15216f1`. The two early `list` commands run only after completion and lose the active receipt. Close, quit and end of input run after the fixture releases verification and the two fields have already been written. The revised source passes 74 tests in Node and 74 in Deno, including ordinary ordered startup, Markdown results and both Lino encodings.

Native system notifications while the app is closed, authenticated provider acceptance and alerts in the other job workflows remain required. QA24 and HH01 remain open. [Evidence archive](data/forms-cli-attention.tar.gz) · [Per-file checksums](data/forms-cli-attention.tar.sha256.json).
