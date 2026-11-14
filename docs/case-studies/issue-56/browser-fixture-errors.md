# Inert private browser fixture errors

[PR57](https://github.com/link-foundation/meta-sovereign/pull/57) remains draft.
Hosted Security run 42993595060, created 2026-11-11 09:15:09 UTC for exact
commit `8d05198e250591110d3aee262c4053e81f251bc0`, reports
`js/xss-through-exception` at the private experiment control server's line 144.
The preserved full log identifies the finding at lines 13421–13423 and the
resulting pipeline failure at 13978–13980. The prior 9d31 Checks run 42988478841
has now completed successfully, including WebKit.

The private fixture's error branch returned an exception message without an
explicit response type. Browser sniffing could interpret exception markup.
The branch now returns fixed plain text with an explicit UTF-8 content type.
Normal control responses retain their JSON behavior. This is the disposable
experiment control interface, not a change to product API transport.

`node experiments/issue-56/question-browser-error-before.mjs` extracts the
preceding committed handler into a temporary experiment module, reproduces a
500 response reflecting script markup with no content type, and removes the
module in `finally`. The focused `question-browser-fixture.test.js` injects the
same exception, proves fixed inert text and checks the normal stats response.
It passes with strict scoped lint. Hosted Security run 42995005602 for exact commit `7e0e2f4d9f5ff4b1a279029b31348dbe87031f0f` passes, verifying the correction;
no local resource-intensive CodeQL database was built.

Raw parent and passing logs, the full Security log and exact-head metadata are
preserved in `ci-logs`. All other unchecked issue criteria remain active.
