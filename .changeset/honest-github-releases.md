---
'meta-sovereign': patch
---

Resolve release tags to the checked-out version commit, fail on unknown release or PR lookup results, and preserve complete Markdown and related PR links in GitHub release notes. Bound large notes with a link to the full changelog while retaining the formatting badge.

Avoid concurrent npm cache saves by assigning one writer per workflow/ref/platform and restoring downloads in other jobs.
