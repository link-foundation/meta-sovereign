# Case Study: Issue #3 - Add Email Support

## Issue Overview

**Issue:** [link-foundation/meta-sovereign#3](https://github.com/link-foundation/meta-sovereign/issues/3)

**Title:** Add email support

**Created:** 2026-05-02

The request asks meta-sovereign to support email providers through
browser-first direct requests, with local-server fallback, plus receive,
send, import, export, and a documented case-study analysis.

## Delivered Surface

Email is now a first-class `MessageSource` named `email`.

- Archive import accepts `.eml` and mbox-style exports, including the
  common Gmail Takeout mbox shape.
- Live direct HTTP support covers JMAP, Gmail API, and Microsoft Graph.
- Raw mail protocols are handled by the Node local-server transport:
  IMAP and POP3 for receiving, SMTP for sending. Browsers still use the
  local server for these because they cannot open raw TCP/TLS mail
  sockets.
- The local server exposes `POST /api/email/pull` and
  `POST /api/email/send` so the SPA can fall back to same-origin server
  calls when CORS or raw protocols block browser execution.
- CLI `source-pull --source=email --protocol=...` passes email protocol
  options through to the live adapter, and `email-send` sends through
  Gmail, Microsoft Graph, JMAP, or an injected SMTP transport.
- Empty-state connection guides now list Email and explain direct API
  vs local-server protocol behavior.

## Protocol Matrix

| Protocol/API    | Receive | Send                    | Browser direct            | Local server fallback | Notes                                     |
| --------------- | ------- | ----------------------- | ------------------------- | --------------------- | ----------------------------------------- |
| JMAP Mail       | Yes     | Yes                     | Yes, if CORS allows       | Yes                   | HTTP JSON API over fetch.                 |
| Gmail API       | Yes     | Yes                     | Yes, if CORS/OAuth allows | Yes                   | Uses `users.messages.list/get/send`.      |
| Microsoft Graph | Yes     | Yes                     | Yes, if CORS/OAuth allows | Yes                   | Uses `/me/messages` and `/me/sendMail`.   |
| IMAP            | Yes     | No                      | No                        | Yes, via transport    | Raw TCP/TLS mailbox access.               |
| POP3            | Yes     | No                      | No                        | Yes, via transport    | Raw TCP/TLS mailbox retrieval.            |
| SMTP            | No      | Yes                     | No                        | Yes, via transport    | Raw TCP/TLS mail submission.              |
| `.eml` / mbox   | Import  | Export via unified JSON | Yes                       | Yes                   | Archive path; stored as normalized links. |

## Implementation Notes

The existing source adapter framework already normalizes external
messages into `msg:<source>:<external_id>` links. The email adapter keeps
that contract and adds email-specific metadata (`subject`, `from`, `to`,
`cc`, `bcc`, `provider`, `protocol`, and parsed headers where available).

The browser-first path is intentionally limited to HTTP APIs. JMAP,
Gmail, and Microsoft Graph can be attempted with `fetch()`. If the
provider rejects the browser origin, the SPA can use the local server
route as a same-origin proxy. IMAP, POP3, and SMTP are not HTTP APIs, so
the JS server and CLI attach `createNodeEmailTransport()` when those
protocols are selected.

## Changed Files

- `js/src/sources/email.js`
- `js/src/sources/email-node-transport.js`
- `js/src/sources/index.js`
- `js/src/server/routes-mutating.js`
- `js/src/server/index.js`
- `js/src/cli/index.js`
- `js/src/web/connection-guides.js`
- `js/tests/sources.test.js`
- `js/tests/live-connectors.test.js`
- `js/tests/server.test.js`
- `docs/case-studies/issue-3/*`
- `docs/REQUIREMENTS.md`
- `README.md`

## Verification

Targeted tests added before the implementation:

```bash
node --test --test-timeout=30000 --test-name-pattern='email|Email|source registry|http server' js/tests/sources.test.js js/tests/live-connectors.test.js js/tests/server.test.js
```

The full test and check results are recorded in the PR body.
