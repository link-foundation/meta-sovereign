# HTTP transport (languages: en • [zh](HTTP-TRANSPORT.zh.md) • [hi](HTTP-TRANSPORT.hi.md) • [ru](HTTP-TRANSPORT.ru.md))

The JavaScript server uses `lino-rest-api` for structured HTTP messages. The default response is `text/lino`. Request binary Links Notation with `Accept: application/lino-binary`. Writes accept the same media types in `Content-Type`; `text/lino-line` and `text/lino-compact` are also supported. Binary bodies encode the typed object AST, preserving strings, numbers, Unicode and empty containers.

Unsupported request representations return 415. An unacceptable response representation returns 406 before a mutation runs. Specific `Accept` exclusions take precedence over wildcards. Origin, Host, passcode, redaction and request-size checks still apply. Ordinary request bodies are limited to 1 MiB; routes with an existing larger archive limit retain it. Decoders also bound input size, nesting and binary graph expansion.

JSON compatibility is disabled by default. A legacy client must explicitly enable it on the server:

```bash
node js/bin/meta-sovereign.js serve --json-compatibility=true
```

The library option is `startServer({ jsonCompatibility: true })`; the environment equivalent is `MS_JSON_COMPATIBILITY=1`. In compatibility mode a client can request `application/json`, while explicit Lino requests continue to work. The new browser client uses Lino and rejects unexpected JSON replies by default. Provider APIs, downloaded files and raw media/archive uploads retain their own formats.

Live change and Telegram account-notification streams use `text/event-stream` with one `text/lino-line` record per data field. The browser requests `?format=lino-line`, including against compatibility-enabled servers. Embedded newlines are escaped by the codec. JSON events require server compatibility mode; `?format=json` otherwise returns 406. Reconnection, origin checks, secret filtering and slow-client handling remain active.

R-AA16 is still unfinished: socket sync/signaling and the Rust backend require their protocol migration and verification. This HTTP change alone does not establish native-server parity. See the [requirement ledger](REQUIREMENTS.md) and [transport investigation](case-studies/issue-56/lino-http.md).
