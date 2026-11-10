# Telegram user sign-in and session import

In Connections, choose Telegram and enter an API ID/hash from your own Telegram
application. Sign in by phone number and enter the requested code and optional
2FA password, or choose QR sign-in. Extra accounts use separate account slots.
Successful sign-in stores a reusable user authorization in the selected local
store. Temporary authorization clients close after completion without logging
out that saved authorization.

The same phone flow is available in a terminal:

```sh
meta-sovereign telegram-login --api-id=2040 --store=/path/to/store
```

API hash, phone, code and password prompts do not echo typed input. API ID also
accepts `TELEGRAM_API_ID`; hash and phone accept `TELEGRAM_API_HASH` and
`TELEGRAM_PHONE`. Saved API credentials are reused when present. Avoid putting
private values in shell history: secret command-line options are rejected.
Without a terminal, missing interactive values fail with `NEEDS_TERMINAL`.
Ctrl+C, EOF and process termination stop the flow and release its client before
closing the store. Interactive login expires after five minutes. Incorrect
codes/passwords can be entered again; at most 20 submitted steps are accepted.

To import an existing GramJS/MTProto string-session file explicitly:

```sh
meta-sovereign telegram-session-import --file=/path/to/.telegram_session --api-id=2040 --store=/path/to/store
```

This reads at most 64 KiB and leaves the source file unchanged. It supports the
legacy IPv4 and string-address encodings accepted by the installed SDK. SQLite
and binary session files require a separate conversion and are rejected here.
The application connects with the supplied API credentials and verifies the
account before replacing the saved primary session. Identification has a
12-second deadline; a refusal or timeout preserves previous credentials.
Command output contains status/error codes and public account ID/username,
never the session, API hash, phone, code or password.

The existing **Find Telegram sessions on this computer** panel also discovers
legacy credentials read-only and lets you choose an account to connect. A phone
credential without a reusable session continues through the same code/2FA API.
The default Lino routes are `/api/auto-import/telegram/login/start`, `code`,
`password`, `cancel`, `qr-start`, `qr-status` and `qr-cancel`. Clients must retain
the returned login ID for subsequent steps. Server shutdown cancels and awaits
pending sign-ins. `MS_TELEGRAM_LOGIN_DEBUG=1` enables phase-only diagnostics;
it is disabled by default.

Changing the login mode, leaving the form or rescanning discovered credentials
cancels its pending authorization. Late responses cannot replace the selected
flow. Accepted code/password steps clear those inputs; successful sign-in clears
the form and shows the confirmed account.

See [implementation and validation evidence](case-studies/issue-56/telegram-login.md).
