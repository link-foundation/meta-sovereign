# Server and automation configuration (languages: en • [ru](SERVER-CONFIGURATION.ru.md) • [hi](SERVER-CONFIGURATION.hi.md) • [zh](SERVER-CONFIGURATION.zh.md))

`meta-sovereign serve` and the desktop shell read readable Links Notation
configuration in this order:

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
| `theme`                   | `system`, `light`, `dark`, `auto`                         | `--theme`                 |
| `skin`                    | `t3`, `telegram`, `whatsapp`, `signal`                    | `--skin`                  |
| `language`                | `system`, `en`, `ru`, `zh`, `hi`                          | `--language`              |
| `uiUrl`                   | HTTP(S) address of the hosted app                         | `--ui-url`                |

Files are limited to 64 KiB. Named pipes and other nonregular files refuse
without waiting for a writer. Unsupported fields, invalid values, unreadable
files and credentials in configured URLs stop startup with a generic message.
Keep tokens, passwords and cookies in the app's protected credential controls.

The desktop executable accepts the same startup overrides, including
`--app-config=<file>`, `--port=<n>` and `--store=<directory>`. Its defaults keep
the bundled UI enabled, choose a free port and leave TLS off. With `localUi`
false, the default port becomes 8787 so the hosted app can discover the server;
an explicit custom port may require choosing that server in Settings. Explicit
TLS uses HTTPS for the desktop window. Its certificate exception is limited to
the owned window, exact local origin and server certificate fingerprint;
unrelated certificates retain normal browser verification. Native clipboard
permission remains limited to the owned local origin, including over HTTPS.

Appearance defaults apply when a browser has no saved choice. An explicit reset
allows the browser to use current defaults again.

## Six desktop VK automations

The same files may contain `automations`, with a `vk` object containing `online`,
`friends`, `cleanup`, `outgoing`, `wall` and `birthday`. See the complete readable
[example](../examples/desktop-automation-config.lino); its six policies are paused.
Copy it to `.meta-sovereign/config.lino` and replace the illustrative IDs and text
before enabling an automation. Objects use named references as in the example.

| Policy                | Native fields in addition to `enabled` and `everyMinutes`                                                                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `online`              | No additional fields; interval is 1–14 minutes                                                                                                                                                                 |
| `friends`             | `maxFriends`, `batchSize`, `priorityIds`, `topPercentMutuals` (0–100), `acceptancePolicy` (`ranked-batch`, `desktop-ten-percent`, `desktop-configured`)                                                        |
| `cleanup`, `outgoing` | `limit`, `priorityIds`                                                                                                                                                                                         |
| `wall`                | `limit`, `cooldownDays`, `communities`, `messages`, `marker`, `attachments`, `restrictedCommunities`, `restrictedMessage`, `replaceOwned`, `activeAvatar`, `randomAttachment`, `holdAnyVisible`, `priorityIds` |
| `birthday`            | `limit`, `scanLimit`, `timeZone`, `messages`, `stickers`, `attachments`, `onlineOnly`, `priorityIds`                                                                                                           |

Other intervals are 1–1440 minutes. The same native validation, limits and refusal
rules apply as in the automation controls. In particular, wall invitations need
configured destinations before enabling and a marker in every invitation text.
See [friends](VK-FRIEND-REQUESTS.md), [maintenance](VK-FRIEND-MAINTENANCE.md),
[invitations](VK-COMMUNITY-INVITATIONS.md) and [birthdays](VK-BIRTHDAY-GREETINGS.md).
Legacy empty/scalar/list representations use the native compatibility readers;
invalid populated shapes refuse. Lists in a later file replace earlier lists.

Policy precedence, from lowest to highest:

1. Native paused defaults.
2. Global file, then local/selected file; fields merge within each policy.
3. `--automation-defaults=<readable-Lino>`; its document contains `vk` directly,
   without the outer `automations` wrapper.
4. Acknowledged owner settings already saved through the UI, API or CLI.
5. Explicit policy command flags, such as `--every-minutes=7`, when saving.

For example, `meta-sovereign vk-online --app-config=.meta-sovereign/config.lino`
reads effective settings. Adding `--every-minutes=7` saves an owner choice that
continues to win over later file changes. Reading defaults does not write policy
settings or start provider work. Each file layer must be valid even when a later
layer overrides a field. Inline Lino is also limited to 64 KiB. Unknown fields,
tokens, passwords and cookies refuse with a generic error; use the existing
protected credential controls, including masked `vk-token import`, for secrets.

Restart the desktop or repeat `serve` to read changed files. Rolling `serve`
prepares a replacement only when effective defaults change and clears defaults
removed from the file. Existing saved policies remain authoritative, including a
saved pause. Explicit `enabled true` can enable a previously unconfigured policy
when a server scheduler starts, subject to its existing credential and delivery
guards. CLI status reads never start a scheduler.
