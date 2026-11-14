# Telegram history export

Chat and Operator share **Export chat history** in the chat menu. Choose
complete history or the latest active conversation, formats, media kinds,
size limit, dates and a destination folder. The export runs on the connected
server, so its absolute folder belongs to that machine. A phone connected to
a desktop exports to the desktop. No export is advertised without a connected
Telegram user account.

An active conversation ends at the first gap of **at least four hours** while
reading backward from the newest available message. The gap is configurable
from 0.01 to 168 hours. Its upper message ID is frozen during discovery;
messages arriving afterward are excluded. Discovery reads pages of 100 and
retains peer/ID ranges rather than a history-sized message array. Export then
writes the selected messages in chronological order. Date filters apply within
that selected conversation; they do not select an older conversation instead.

Accessible pre-migration basic-group history is included in complete exports
and in active conversations that cross the migration boundary. Both the service
marker and channel migration metadata are supported. Each structured message
retains `source_chat` alongside its ID, since old and new peers can reuse IDs.
An inaccessible old peer fails the job explicitly and leaves valid partial
output. It does not silently claim complete history.

## Command line

Use an account already connected in the selected application store:

```sh
meta-sovereign telegram-export --chat=@export_team --folder=/absolute/path/export --scope=active --formats=markdown
```

The CLI defaults to `active`, a four-hour gap and `markdown`. API and UI
defaults remain complete history and HTML for compatibility. Supported options:

| Option                                | Meaning                                                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `--chat`                              | Exact signed peer ID, username, public `t.me/name[/message]` or private `t.me/c/id[/message]` link. Chat titles and invite joins are refused. |
| `--folder`                            | Absolute output directory outside the application store. Existing export files are protected from replacement.                                |
| `--scope=active\|all`                 | Latest active conversation or complete accessible history.                                                                                    |
| `--gap-hours=4`                       | Active-conversation boundary, 0.01–168 hours.                                                                                                 |
| `--formats=markdown\|html\|json`      | Comma-separated selection; Markdown also writes linked structured JSON parts.                                                                 |
| `--max-lines=1500`                    | Markdown and paired JSON part cap, integer 32–1500.                                                                                           |
| `--media=all\|none\|photos,files,...` | Also supports `videos`, `voice`, `roundVideo`, `stickers`, `gifs`.                                                                            |
| `--size-limit-mb=8`                   | Existing video/file limit, integer 1–4000 MB.                                                                                                 |
| `--from`, `--to`                      | Optional inclusive local-calendar dates, `YYYY-MM-DD`.                                                                                        |
| `--store`                             | Application store containing the Telegram account/session.                                                                                    |
| `--debug=true`                        | Default-off boundary/range/migration diagnostics without message text or credentials.                                                         |

The command retains the account and store until the job closes its output.
Ctrl+C requests cancellation, waits for closure and exits unsuccessfully with
the partial job state. It does not discard completed files.

## Output and progress

HTML and `result.json` retain their existing formats. Markdown creates
`history-1.md` and `history-1.json`, followed by numbered pairs as needed.
Navigation links connect parts and their structured counterparts. Every part
stays within the configured physical line cap, including headers and wrappers.
JSON uses one compact message record per line. A large multiline message can
continue across Markdown parts: the complete structured original occurs once,
and later fragments reference it with `continuation` and `originalPart`.

Authors, timestamps, source peers, message IDs, text, service details and media
references remain available. Actual downloads are relative links; skipped or
failed downloads retain explicit notes rather than broken success claims.
Completion with media failures displays the failed count in the shared dialog.
History/access/output errors fail the job; cancellation and failures retain
valid output written so far. Migration-spanning totals remain unknown while
reading rather than displaying the current peer's count as a complete total.

## API

The existing account operations `exportDefaults`, `exportStart`, `exportStatus`,
`exportCancel` and `exportReveal` are shared by the CLI and Telegram export
routes. `exportStart` accepts the existing `chat`, `folder`, `media`,
`sizeLimitMb`, `formats`, `from`, `to`, `chatName` plus `scope`, `gapHours`,
`maxLines` and `debug`. Invalid options are rejected before provider reads.
Use the default Lino transport; the optional JSON compatibility layer does not
change these operations. The returned job includes `scope`, `gapHours`,
`maxLines`, `phase`, counts and actual terminal state.

See the [implementation and verification study](case-studies/issue-56/telegram-export.md).
