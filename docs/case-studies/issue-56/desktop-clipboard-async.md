# Await native clipboard completion

The real Electron check on `c0b31a6c` failed in
[desktop job 132966922832](https://github.com/link-foundation/meta-sovereign/actions/runs/43764560638/job/132966922832).
The downloaded 353-line log records `TypeError` at line 336 and a nonzero exit
at line 337. Added fixture phase diagnostics preserve operation names and
exception classes without logging clipboard contents or private paths.

The CI resolver selected Electron 45.3.2. Its
[pinned clipboard API](https://github.com/electron/electron/blob/v45.3.2/docs/api/clipboard.md)
defines `readText` and `writeText` as Promise-returning methods. The initial
handler returned a successful receipt immediately after starting a write;
an asynchronous refusal also escaped its synchronous catch. The fixture
compared a pending read with text, then passed the previous pending read to
`writeText` during cleanup, masking the readback assertion with a type error.

Reproduce the early acknowledgement without Electron or any clipboard:

```sh
node experiments/issue-56/desktop-clipboard-async.mjs --before
node experiments/issue-56/desktop-clipboard-async.mjs
node --test --test-concurrency=1 js/tests/desktop-clipboard.test.js js/tests/vk-token-electron-entry.test.js
```

The exact parent reports `acknowledgedBeforeCompletion:true` and fails the
assertion; the corrected handler reports false, then acknowledges completion.
Main now awaits the native write inside its catch. This works for older
synchronous implementations too. The fixture awaits its previous content,
readbacks and restoration. Two added regressions hold a write pending, reject
another asynchronously and exercise the actual fixture against asynchronous
native-method fakes, including foreign-origin refusal, restoration and disposal.
Eight focused checks pass. The renderer is unchanged, so existing browser/MCP
views still apply. Actual native and full runtime checks remain pending on the
corrected commit; VD08 and all other unchecked requirements remain open.

Evidence: [archive](data/desktop-clipboard-async.tar.gz),
[hash manifest](data/desktop-clipboard-async.tar.sha256.json).
