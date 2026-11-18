# Private vacancy description HTML

The pinned HH workflow's A10/A12 requires private vacancy text, HTML, skills
and requirements to survive later runs. Its
[vacancy insight reader](https://github.com/konard/hh-job-application-automation/blob/fa0991b8c2d0896fb3b4be6c69947f0590094b15/src/vacancy-insights.mjs)
retains the description container's `innerHTML`. At published parent
`1f0c7287b7869c2a41fea826c84723607d3156dd`, the shared browser reader omitted
that field and the success-only cache projection discarded it even when a
custom reader supplied it. A later run could recover the prose, but never the
employer's description markup.

Reproduce the actual parent with the new regression and one isolated native
browser:

```sh
python3 experiments/issue-56/vacancy-html-before.py --browser
```

The experiment temporarily restores the three exact parent production files and
restores the working versions in `finally`. Fifteen focused checks fail on
the missing HTML or admitted invalid refresh, with legacy and analysis compatibility
controls passing. The native assertion separately observes `undefined` instead
of `Build Python services.<br>Final employer paragraph.` in the actual cache.

The corrected reader takes HTML only from the single visible vacancy
description container in the same synchronous read as the visible prose.
Missing or ambiguous containers, challenges, bad identities and descriptions
over 120,000 UTF-16 code units refuse collection without truncation. The cache
accepts only nonblank text within that bound and rejects control characters
other than newline, carriage return and tab. Leading/trailing whitespace,
entities and tags survive exactly as the browser serialized them. It never
captures the entire account page. Old snapshots without HTML remain readable;
their missing content is not invented and an explicit refresh can collect it.

`descriptionHtml` is optional data on the existing version-1 vacancy record.
The additive field needs no migration: old records keep their prior meaning.
Collection, acknowledged persistence, a fresh store opening, CLI, HTTP text
and binary Lino, and the browser's offline cache projection share this
validation. Failed refreshes preserve the complete acknowledged snapshot.
Assignment model context still contains only the existing plain-text fields.
Technology analysis also excludes the raw HTML from its unchanged input budget,
saved reports and fingerprints, so markup cannot inflate or change prose analysis.
The UI continues to render the description as React text; cached untrusted
HTML is never inserted into a document or executed.

Run the small focused validation with one worker:

```sh
node --max-old-space-size=384 --test --test-concurrency=1 --test-timeout=10000 js/tests/vacancy-html.test.js js/tests/vacancy-reader-regression.test.js js/tests/vacancy-search.test.js js/tests/job-vacancy-cache-durability.test.js
node --max-old-space-size=384 experiments/issue-56/vacancy-html-browser.mjs
```

Thirty-one Node checks pass. The native shared CV-panel scenario retains four
metadata variants and adds ambiguous/oversized HTML refusals. Seven actual
owned provider pages close with zero provider clicks, zero page exceptions,
exact cache/API HTML readback, cache-only reload and no phone overflow. The
existing mandatory `vacancies` group runs this assertion in both hosted browser
lanes. This correction changes private data handling, with no visual change.

The [source-bound evidence archive](data/vacancy-html.tar.gz) and its
[SHA-256 manifest](data/vacancy-html.tar.sha256.json) retain the parent,
corrected source, assertions, original reference, logs and native receipt.
Full runtime/browser matrices remain assigned to CI. These synthetic checks
do not establish authenticated HH parity; HH03 and every other unfinished
inventory criterion remain required. PR57 stays draft and unmerged.
