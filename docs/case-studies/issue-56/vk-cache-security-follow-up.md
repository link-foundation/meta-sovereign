# VK cache assertion security follow-up

PR: https://github.com/link-foundation/meta-sovereign/pull/57

At commit `8c3049337025d4286db77ae3a9690c0a95892589`, security run
43729197839 (created 2026-11-15 15:19:07 UTC) completed with one unresolved
CodeQL finding. The preserved log `ci-logs/security-43729197839.log`, lines
17193–17196, identifies `js/incomplete-url-substring-sanitization` at
`js/tests/vk-cache.test.js:208`. Dependency audits and the other CodeQL
languages passed; the JavaScript analysis itself completed successfully.

The test checked a generated author URL using a substring assertion.
It now matches the complete Markdown destination with escaped hostname dots
and closing delimiters. This verifies the intended link more precisely.
The focused export regression passes (one test), recorded in
`ci-logs/vk-cache-url-assertion.log`. No security gate is suppressed.
The correction still requires hosted CodeQL verification on its published
commit; VK24 remains unaccepted until that and the complete matrix pass.
