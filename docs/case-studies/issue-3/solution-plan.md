# Solution Plan for Issue #3

## Plan

1. Replace the stale case-study material for issue #3 with the actual
   meta-sovereign email request and raw issue data.
2. Add a pure JavaScript `email` source adapter that matches the
   existing `MessageSource` contract.
3. Normalize imports from `.eml`, mbox, Gmail API, Microsoft Graph,
   JMAP, and generic JSON into the same message link shape.
4. Implement live HTTP protocol modes for JMAP, Gmail API, and
   Microsoft Graph so browser-capable provider APIs can run directly
   via `fetch()`.
5. Implement IMAP, POP3, and SMTP through a Node-only local-server
   transport so raw TCP/TLS support stays out of browser bundles.
6. Add local server fallback routes for receive/send so the SPA can call
   same-origin endpoints when direct provider calls fail.
7. Update CLI and connection guides so the new source is discoverable.
8. Add regression tests before the implementation and run the local
   validation suite.

## Result

The delivered implementation follows this plan. The raw-protocol
transport is a zero-dependency Node module and is attached only by the
server and CLI fallback paths, which keeps browser bundles on the
HTTP/API adapter.
