# Saved publication destinations

Open **Broadcast → Destinations & credentials** to save Telegram channels or
groups, VK personal or community walls, and the authenticated X account. Select
destinations in **Compose**, enter the message and press **Preview**. Publishing
uses the exact reviewed text, destinations and authentication modes. Editing a
destination or credential invalidates the pending confirmation.

Use **Published posts** to inspect each result, its provider identifiers and any
available public link. **Delete published post** asks for confirmation and uses
the original destination and recorded identifiers, even after that saved
destination is edited or removed. A deletion succeeds only with a positive
provider acknowledgement. Receipts remain in history after deletion.

## Credentials and capabilities

| Provider | Authentication and destination                                                                                                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Telegram | Automatic mode prefers a configured bot; explicit bot/user modes never silently switch identity. Numeric chat IDs and `@username` destinations support plain text or HTML. User login, 2FA and saved sessions use the existing Connections screen.                           |
| VK       | Separate user and community tokens. Personal walls use positive owner IDs; community walls use negative IDs. Community authorship and signed posts are explicit options. A community token cannot select a personal wall. Actual API permission/captcha errors are reported. |
| X        | Automatic, OAuth 1.0a user, OAuth 2.0 user and application-only modes. Application-only credentials are read-only and cannot publish/delete as a user. Posts use the authenticated account.                                                                                  |

Credential inputs are masked and never populated with saved values. Blank inputs
preserve existing values; **Clear saved …** removes the corresponding local
secret record. Environment variables or older connection credentials can still
apply after clearing. Presence indicators disclose availability, not values.

Supported environment variables are `TELEGRAM_BOT_TOKEN`, `VK_ACCESS_TOKEN`,
`VK_COMMUNITY_TOKEN`, `X_API_KEY`, `X_API_KEY_SECRET`, `X_ACCESS_TOKEN`,
`X_ACCESS_TOKEN_SECRET` and `X_BEARER_TOKEN`. Credentials are stored separately
from destinations and publication history. Server secret protection and existing
Telegram session controls apply.

**Test identity** performs a read-only provider request; it never sends a test
post. A successful identity read does not prove destination write permission.
The preview shows configured/read-only states and leaves permissions unverified
until the actual provider operation responds. No browser automation fallback
silently publishes under another identity.

## CLI

All commands accept `--store=<dir>`. For example, after configuring credentials:

```sh
meta-sovereign broadcast-setup --network=telegram
meta-sovereign broadcast-target-save --id=news --label=News --network=telegram --kind=channel --destination=@my_news --auth-mode=auto --format=html
meta-sovereign broadcast-targets
meta-sovereign broadcast-test --id=news
meta-sovereign broadcast-preview --targets=news --text='<b>Announcement</b>'
meta-sovereign broadcast-send --targets=news --text='<b>Announcement</b>' --request-id=announcement-2026-11
meta-sovereign broadcast-history --id=announcement-2026-11
meta-sovereign broadcast-delete --id=announcement-2026-11 --targets=news
```

Sending/deletion display a preview and require interactive confirmation; `--yes`
provides explicit noninteractive confirmation. Use `--all` instead of
`--targets` for all enabled destinations. `--debug=true` records bounded
metadata diagnostics for that publication. VK target options include
`--from-group=true|false` and `--signed=true|false`; saved destinations support
`--enabled=true|false`. `broadcast-target-remove --id=news` removes routing only.

`broadcast-setup` reads credentials without terminal echo. Alternatively,
`broadcast-credentials --network=<provider> --file=<private-json-file>` imports
an object containing only that provider's credential fields; the file is limited
to 64 KiB. Without `--file`, it returns presence flags. API field names below
also identify the accepted file keys. Avoid entering credentials in shell
arguments or committing credential files.

## API

The existing default text/binary Lino transport exposes these paths. Request
objects listed here describe the data model; JSON compatibility remains a
separate server opt-in. Use the shared client transport and confirmation flow.

| Method/path                                         | Data and behavior                                                                                                                                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/broadcast/targets`                        | Returns saved destinations.                                                                                                                                                                                                  |
| `PUT /api/broadcast/targets`                        | `{target}` with ID, label, network, kind, destination, authMode, format, enabled and optional VK flags; assigns a new version.                                                                                               |
| `DELETE /api/broadcast/targets?id=<id>`             | Removes the saved destination.                                                                                                                                                                                               |
| `GET /api/broadcast/credentials?network=<provider>` | Returns boolean presence flags.                                                                                                                                                                                              |
| `PUT /api/broadcast/credentials`                    | `{network,credentials}`; omitted fields preserve, empty strings clear local values. Telegram: `botToken`; VK: `userToken`, `communityToken`; X: `apiKey`, `apiKeySecret`, `accessToken`, `accessTokenSecret`, `bearerToken`. |
| `POST /api/broadcast/test`                          | `{targetId}`; read-only identity/capability result.                                                                                                                                                                          |
| `POST /api/broadcast/preview`                       | `{text,targetIds,requestId?,debug?}` or `{text,all:true,...}`; no provider writes.                                                                                                                                           |
| `POST /api/broadcast/publish`                       | Same data; existing two-phase confirmation binds the exact prepared plan before a provider write.                                                                                                                            |
| `GET /api/broadcast/history?limit=50`               | Most recent entries; limit 1–100. `?id=<id>` returns one entry.                                                                                                                                                              |
| `POST /api/broadcast/delete`                        | `{id,targetIds?}`; two-phase confirmation binds original receipts and current credentials.                                                                                                                                   |

The existing `POST /api/broadcast` also accepts saved target selections. Its
legacy network-selection flow and CLI `broadcast --networks` remain available.

## Interruptions and diagnostics

Choose 1–100 enabled destinations and a nonblank message of at most 100,000
characters. Providers may impose smaller limits or reject unsupported formatting.
Each destination retains its own sent, failed or unknown outcome; aggregate
results preserve partial delivery. Publishing stops on uncertainty, rate limiting
or three consecutive failures. Unstarted destinations are recorded as stopped.

Intent is persisted before each write. Reusing a request ID returns its existing
record; changing its text/destinations causes a conflict. Interrupted writes
remain uncertain, and neither reload nor reconnect retries them. A store failure
after delivery can prevent receipt persistence: inspect the actual destination
before taking further action. History cannot invent missing provider IDs.

The browser preserves its draft and pending request ID before publishing. It
blocks another send while the outcome is uncertain. **New publication** warns
that a new request ID can repeat an already delivered message; it is an explicit
owner decision. Unknown deletion outcomes similarly prevent repeated deletion.
These controls do not promise atomic delivery across external providers.

Diagnostics default off. Enabling them retains at most 200 operation/status
events per publication, excluding message text and credential values. The
history details expose these events; ordinary receipts still show the actual
destination and provider IDs. `node examples/saved-publications.mjs` exercises
the lifecycle with offline providers and dummy credentials.
