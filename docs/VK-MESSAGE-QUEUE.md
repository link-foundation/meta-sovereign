# VK automated message queue

Open **Connections → VK → VK automated message queue**. Enable pacing for
reviewed automated replies and VK personal-message policies. Saving settings,
refreshing receipts or reopening the application does not send or resume work.
Ordinary manual chat sends keep their existing behavior.

The queue processes one message at a time across these policies in this server
store session. Every admitted request receives its own result. Pacing is off by
default; the same queue still orders immediate delivery when it is off.

- Text waits 10–14 seconds plus its character count at the saved typing speed.
  The default is 450 characters per minute; the allowed range is 60–3000.
- Stickers wait 6–8 seconds and never display typing.
- Optional typing starts after 6–8 seconds and repeats every five seconds.
  A reply policy that disables typing, or an option-only answer, keeps it off.
- Optional read acknowledgement runs after 2–4 seconds for a reply with an
  evidenced incoming message. It passes that message's native ID to VK's read
  boundary. Unsolicited background greetings do not mark conversations read.

Current consent, reply evidence and saved policy are checked before read/typing
effects and delivery. Changing queue settings invalidates already admitted work
that has not begun its provider operation, including work waiting behind another
message. Review it again explicitly. Stop/shutdown cancels waits and drains
provider operations that have already started before closing storage.

Recent receipts show queue progress, read and typing acknowledgements, and
durable **delivery** separately. An interrupted wait does not mean a message was
sent. A failed queue receipt can coexist with confirmed delivery; always check
the delivery result before taking further action. Unknown delivery remains
reserved and is never retried automatically. A prior sent/unknown receipt also
prevents new read or typing effects. Restart only restores inspection.

The panel retains the 50 most recent receipts and 50 peer-trigger states, with
total counts and actual queued-draft counts. A peer-trigger receipt means draft
planning finished; it is not a delivery receipt. Failed saves retain the last
acknowledged settings and expose a retryable error. Offline controls save local
configuration and inspect local records; they do not execute provider work.

```sh
meta-sovereign vk-send-queue
meta-sovereign vk-send-queue --enabled=true --mark-read=true --typing=true
meta-sovereign vk-send-queue --chars-per-minute=600
meta-sovereign vk-send-queue --enabled=false --store=/absolute/store
```

The ordinary foreground command inspects or saves settings, then closes its
store. The same-origin `/api/vk/send-queue` endpoint supports GET inspection and
POST settings in the default text/binary Lino protocols. It offers no action
that starts or resumes messages. Use the existing reviewed automation and
personal-policy commands to submit new work.
