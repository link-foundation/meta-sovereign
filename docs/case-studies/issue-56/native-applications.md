# Native HH application executor

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft
and unmerged. This atomic unit supplies the owned executor and CLI/Lino
interfaces. HH06–HH08 remain unchecked until the browser controls, deferred
retry policies and remaining acceptance criteria are implemented and verified.
The advertised `apply` capability stays false during that work.

The published parent `8d16669e` lacks application routes and CLI commands.
`python3 -B experiments/issue-56/application-before.py` reproduces four focused
interface failures against those exact parent sources and restores every
working byte afterward. The final focused checks exercise the new service,
HTTP text/binary Lino routes, browser API validation and foreground CLI.

The executor reads the complete native vacancy before entry, owns one isolated
HH browser slot and defaults to the existing visible-browser policy. Entry is
an explicit application action because HH can deliver immediately from that
button. Native form review and positive delivery markers have separate states.
The shared form planner receives HH-scoped exact matching and full vacancy
context. It fills only admitted native-form fields, preserves existing owner
values and verifies a requested cover letter after native popup/full-form
navigation. Automatic submission is opt-in, requires complete exact answers
and checks the document, controls and answers again after the configured delay.
CAPTCHA, daily-limit, external application and newly changed forms stop it.

Before an application click can issue, a private durable journal reserves its
vacancy, slot, request identity and attempt. A lost dispatch response stays
unknown through restart and a fresh request ID; it never triggers a replay.
Only an explicit native positive marker establishes confirmed delivery. A
known synchronous pre-dispatch refusal may release its unissued reservation.
Failed puts/flushes restore acknowledged memory before reads can return.
Stop drains issued work and late browser launches before closing the owned
browser. Session-only pause/questionnaire deferral is absent from the journal;
it never writes permanent vacancy skips.

The CLI is foreground: use `vacancies-application --url=https://hh.ru/vacancy/123
--request-id=owner-request`, then enter the listed commands on standard input.
`enter` may immediately apply; `prefill` may submit after the opted-in exact
review delay. `submit` explicitly sends the reviewed native form. `read` refreshes
that browser, `status` reads the acknowledged receipt, and EOF/quit closes it.
The separate `vacancies-application-status` command never launches a browser.
Use `--recover=true` to explicitly reopen an existing intent, `--test-mode=true`
for zero clicks/fills, and `--cover-letter-file` for a reviewed UTF-8 letter.
The command lists the pause/resume and questionnaire controls as well.

HTTP exposes `GET /api/vacancies/application-status` and POST operations
`application-open`, `application-read`, `application-prefill`,
`application-advance`, `application-mode` and `application-close` through the
existing text/binary Lino transport and trusted mutation guard. Actions require
the current receipt's revision, URL, slot and request ID. Status distinguishes
confirmed absence from failed/unknown reads. Client mutations have no offline
fallback and no automatic POST retries.

Two finite native Chromium scenarios exercise real DOM/commander navigation:
full vacancy context, an HH-scoped answer, verified full-form letter, preserved
header input, one entry and one positive submission; and four changes injected
between review and synchronous dispatch (new question, replaced button, wrong
vacancy and CAPTCHA), each producing zero submissions before an explicit fresh
review. Page-error lists remain empty. The fixture contains synthetic owner
answers and intercepts provider traffic; it is not an authenticated HH account.
Programmatic DOM clicks may be rejected by a provider requiring trusted input;
without a native positive marker delivery remains unknown.

The [evidence archive](data/native-applications.tar.gz) and its
[manifest](data/native-applications.tar.sha256.json) preserve sources, exact
parent failures, draft verification failures and final focused/native checks.
Both hosted browser engines are registered in the existing matrix. Full suites
and exact published-head verification remain hosted. No UI layout changes are
included in this executor unit; the browser controls remain the next task.
