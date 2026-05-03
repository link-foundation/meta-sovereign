# External Research for Issue #3

Primary sources used for the email support design:

- [RFC 8620: JMAP Core](https://www.rfc-editor.org/rfc/rfc8620.html)
  defines JMAP as an HTTP JSON synchronization protocol.
- [RFC 8621: JMAP for Mail](https://www.rfc-editor.org/rfc/rfc8621.html)
  defines the JMAP Email data model and `Email/query`, `Email/get`,
  `Email/set`, and submission-related flows.
- [RFC 9051: IMAP4rev2](https://www.rfc-editor.org/rfc/rfc9051.html)
  defines IMAP mailbox access over reliable streams such as TCP.
- [RFC 1939: POP3](https://www.rfc-editor.org/rfc/rfc1939.html)
  defines POP3 mailbox retrieval.
- [RFC 5321: SMTP](https://www.rfc-editor.org/rfc/rfc5321)
  defines SMTP mail transfer/submission semantics over TCP.
- [Gmail API REST reference](https://developers.google.com/workspace/gmail/api/reference/rest)
  documents mailbox access through Gmail HTTP resources.
- [Gmail `users.messages.send`](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
  documents sending raw messages through Gmail.
- [Microsoft Graph list messages](https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0)
  documents `/me/messages` and message paging.
- [Microsoft Graph `sendMail`](https://learn.microsoft.com/graph/api/user-sendmail?view=graph-rest-1.0)
  documents sending mail with JSON or MIME.
- [MDN Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
  and [MDN CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS)
  document the browser HTTP request model and cross-origin constraints.

## Conclusions

JMAP, Gmail API, and Microsoft Graph are suitable for browser-first
attempts because they are HTTP APIs. IMAP, POP3, and SMTP are stream
protocols; they belong behind a local server transport for web clients.
The implementation therefore separates API normalization from transport
execution.
