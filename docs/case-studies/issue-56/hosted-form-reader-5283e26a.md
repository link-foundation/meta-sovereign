# Generic form reader: complete QA21 review

QA21 is verified at `5283e26af0135f86fc879a30be18ae418da17c4a`.
The inventory now contains **84 verified criteria and 34 unfinished criteria**.
Every unfinished requirement remains required in the draft, unmerged
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).

## Complete pinned reading contract

The [pinned B13 contract](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/docs/requirements/forms-and-chats.md)
requires generic accessible question extraction, including labels, legends,
placeholders and nearby headings. B10 requires iframe access. The decoded
reference and its Git blob identity are preserved in the hosted archive.
The [acceptance mapping](form-reader-criteria-audit.md) describes the complete
reader boundary and separates automatic prefilling, learning and assignments
into QA22–QA24.

The current extractor, frame inspection, reader ownership, CLI/API routes,
report rendering and native assertion bodies were reviewed. Extraction selects
referenced accessible labels before weaker label evidence, excludes embedded
control values from labels and retains descriptions, groups, actual owner
whitespace, states and available options. Native controls and exposed ARIA
controls share one report. Password and file values remain omitted. Reading
never clicks, fills, changes or submits a control.

Browser-commander owns navigation and main-document extraction. Connected frame
handles read actual cross-origin child documents. Every captured document is
rechecked before the report is returned; replacement or detachment refuses the
snapshot. Hidden/unavailable frames, unopened choices and finite scan limits
remain explicit partial coverage. Owned browser cleanup covers refused reads,
concurrent admission, shutdown during launch and inspection deadlines.

The library, CLI, both Lino encodings and shared localized UI call the same
reader. Actual report download, retained URL/report after a refusal, explicit
retry, phone layout and unavailable browser controls are verified. These
fixtures establish generic accessible reading; they do not claim a live
Google/Yandex account or complete provider acquisition.

## Exact-source hosted evidence

All five workflows started on 2026-11-18 at 00:13:47 UTC with the revision above.
They completed successfully, with 72 successful jobs and six intentional
release/deployment skips. Checks and release completed at 01:16:42 UTC.

| Workflow           | Result                                                                                |
| ------------------ | ------------------------------------------------------------------------------------- |
| Checks and release | [Success](https://github.com/link-foundation/meta-sovereign/actions/runs/44206092198) |
| Desktop            | [Success](https://github.com/link-foundation/meta-sovereign/actions/runs/44206092179) |
| Pages              | [Success](https://github.com/link-foundation/meta-sovereign/actions/runs/44206092081) |
| Links              | [Success](https://github.com/link-foundation/meta-sovereign/actions/runs/44206092085) |
| Security           | [Success](https://github.com/link-foundation/meta-sovereign/actions/runs/44206092143) |

The collector requires all 13 reader tests and five report tests by their
unique passing names in the exact-source Ubuntu Node log, lines 3125–3142.
It separately requires the mandatory two-engine browser-registration check.
The focused tests cover finite lifecycle and limits, changed/detached documents,
trace privacy, CLI cleanup, text/binary Lino and localized escaped reports.

Both actual browser groups execute the normal awaited reader path. Chromium
completes in 87,004 ms at log lines 1305–1458; WebKit completes in 110,895 ms at
lines 1080–1233. Each requires 15 native/ARIA fields across two documents,
label precedence and fallbacks, current states and owner whitespace, sensitive
getter omission, zero interaction events and submissions, actual download,
refusal/retry, phone fit and bounded extraction. The actual assertion bodies
were reviewed alongside the successful engine markers; this older scenario
has no JSON semantic envelope.

The original archive independently verifies 35 entries. Its declared source
hashes recover the implementation bytes from published `7c18eee6`; 19 changed
source comparisons retain subsequent integration rather than claiming that
historical hashes alone prove current behavior. The original failing assertion,
independent MCP report with 15 fields, zero submissions and closed fixtures
remain preserved. Current source review and hosted execution supply the
separate acceptance evidence.

## Reproduction and acceptance decision

Use focused local checks; CI owns the complete runtime/browser matrices:

```sh
node --max-old-space-size=384 --test --test-concurrency=1 js/tests/forms-reader.test.js js/tests/forms-report.test.js
RUN_BROWSER_E2E=1 FORMS_GROUP=forms-reader npm run test:e2e:forms-reader
```

The [hosted archive](data/form-reader-hosted-5283e26a.tar.gz) and
[per-file manifest](data/form-reader-hosted-5283e26a.tar.sha256.json) preserve
all five workflow records, three complete selected job logs, exact source,
reference, source audit and collector. All 51 entries were independently
rehash-verified after collection.

The collector intentionally retains `acceptance: false`. This separate review
records the complete reading contract and accepts only QA21. It does not
accept QA22 prefilling, QA23 detached learning or QA24 assignment workflows.
Later feature commits still require their own exact-source hosted gate.
