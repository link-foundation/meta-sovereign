# Components and Libraries Survey

## Existing Components Reused

- `MessageSource` registry in `js/src/sources/index.js` for archive
  import and live pulls.
- `buildMessageLink()` in `js/src/sources/link.js` for normalized
  `msg:*` links.
- `requestJson()` and auth helpers in `js/src/sources/http.js` for
  browser/server HTTP API calls.
- Existing store export paths for unified JSON and encrypted export.
- Connection-guide and local-server-help data model for browser-first
  provider instructions.

## Protocol/API Components Added

- RFC 5322-style `.eml` parser with folded-header support.
- mbox splitter for bulk mail archives.
- Gmail API normalizer for `users.messages.get` payloads.
- Microsoft Graph normalizer for `message` resources.
- JMAP Email normalizer for `Email/get` records.
- Live send helpers for Gmail raw MIME, Graph `sendMail`, and JMAP
  `EmailSubmission/set`.
- Node local-server transport for POP3 `RETR`, IMAP `UID FETCH
BODY.PEEK[]`, and SMTP `DATA`.

## External Libraries Considered

No new dependency was added. Mature libraries exist for MIME parsing and
IMAP/SMTP sessions, but pulling them into the browser-facing package
would increase dependency surface and risk bundling Node-only networking
code. The current implementation keeps raw protocol sockets in
`email-node-transport.js`, which is used by the server and CLI but not by
the SPA.
