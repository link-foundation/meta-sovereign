# Research Notes for Issue #3

## Data Collection

- Issue payload saved to `issue-data.json`.
- Issue comments saved to `issue-comments.json` (currently empty).
- The previous contents of this directory described an unrelated
  release-note formatter issue from another repository. Those stale
  artifacts were removed so this case study matches
  `meta-sovereign` issue #3.

## Main Findings

1. Email support cannot be one protocol. Provider coverage needs a
   layered model:
   - archive import: `.eml`, mbox, and provider JSON exports;
   - browser-capable HTTP APIs: JMAP, Gmail API, Microsoft Graph;
   - local-server-only raw protocols: IMAP, POP3, SMTP.
2. Browser direct support is feasible for HTTP APIs but not for raw
   mail sockets. Browser `fetch()` is HTTP-oriented and subject to CORS.
3. Local-server fallback should not be a separate data model. It should
   call the same adapter and store the same normalized `msg:email:*`
   links.
4. The existing `MessageSource` framework is the right place to add
   email because it already powers archive import, live pulls, contacts,
   search, automation, and unified inbox views.

## Design Decision

The implementation adds a single `email` source with protocol-specific
live modes instead of adding one source per provider. This keeps audience
queries and source lists simple (`network:email`) while preserving
provider/protocol metadata on each imported message.
