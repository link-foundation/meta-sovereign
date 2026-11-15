# Server startup configuration

`meta-sovereign serve` reads readable Links Notation configuration in this order:

1. The OS user's application folder: `config.lino` beside the `store` folder.
   On Linux this is `$XDG_CONFIG_HOME/Meta Sovereign/config.lino`, falling back
   to `~/.config/Meta Sovereign/config.lino`. macOS uses
   `~/Library/Application Support/Meta Sovereign/config.lino`; Windows uses
   `%APPDATA%/Meta Sovereign/config.lino`.
2. `.meta-sovereign/config.lino` in the current working directory, or the file
   explicitly selected with `--app-config=<file>`.
3. Explicit command options, which override file values.

Missing default files are optional. An explicitly selected file must exist.
Relative selected paths resolve from the working directory. `--store` and
`META_SOVEREIGN_STORE_DIR` select data storage without relocating the user's
configuration. Existing server environment fallbacks apply when no file or
command value is supplied; `MS_TLS=off` still turns TLS off.

For example, save this as `.meta-sovereign/config.lino`:

```lino
configuration:
  server configuration_server

configuration_server:
  port 8788
  localUi true
  verbose false
  jsonCompatibility false
```

`meta-sovereign serve --port=8787` then uses port 8787 and retains the other
file settings. The document uses the installed Lino codec's readable format;
it requires no type markers or JSON. Nested objects use named references as
shown above.

| File field under `server` | Accepted value                                            | Command override          |
| ------------------------- | --------------------------------------------------------- | ------------------------- |
| `port`                    | Integer 0–65535; 0 chooses an available port              | `--port`                  |
| `verbose`                 | `true` or `false`                                         | `--verbose`               |
| `localUi`                 | `true` or `false`                                         | `--local-ui`              |
| `tls`                     | `true` or `false`                                         | `--tls`                   |
| `jsonCompatibility`       | `true` or `false`                                         | `--json-compatibility`    |
| `backupIntervalHours`     | Number 0–596; 0 disables periodic backup                  | `--backup-interval-hours` |
| `backupKeep`              | Integer 0–10000; 0 retains all archives                   | `--backup-keep`           |
| `recoveryFormats`         | `text`, `binary`, `text,binary`, `binary,text`, or `none` | `--recovery-formats`      |
| `allowOrigin`             | `none` or comma/space separated origins                   | `--allow-origin`          |
| `uiUrl`                   | HTTP(S) address of the hosted app                         | `--ui-url`                |

Files are limited to 64 KiB. Unsupported fields, invalid values, unreadable
files and credentials in configured URLs stop startup with a generic message.
Keep tokens, passwords and cookies in the app's protected credential controls.
File settings currently configure the CLI server. Desktop runner policies and
live automation settings continue to use their own controls.
