# Capture during borrowed unread visits

- Compare the pinned HH recording reference with the existing finite unread
  visit. Reuse the shared bounded DOM observer and canonical history archive.
- Reproduce a mounted message, two edits and delivery changes disappearing
  during the borrowed callback on published `a5dc8de9`; preserve the actual
  native failure and a problem-state screenshot.
- Keep one navigation lease and queue. Attach capture before the callback's
  stable tail read, flush before actions, drain issued replies and archive writes
  before releasing capture and restoring the original view. Archive failures
  must refuse further effects without revoking a witnessed delivery receipt.
- Add focused lifecycle regressions and a mandatory existing-group browser
  scenario. Run only those checks and one finite native Chromium case locally;
  leave runtime, OS and complete browser coverage to hosted CI.
- Retain source comparison, failure/pass logs and before/after screenshots in a
  checked archive. Update PR57 and the established release note. HH11 remains
  incomplete until every original requirement, including authenticated parity,
  is verified; no other unchecked requirement is deferred or accepted here.
