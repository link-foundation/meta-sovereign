# Dormant VK conversations ([ru](VK-DORMANT-CONVERSATIONS.ru.md) · [hi](VK-DORMANT-CONVERSATIONS.hi.md) · [zh](VK-DORMANT-CONVERSATIONS.zh.md))

Connections → VK has separate **Topic questions**, **Offers of help** and
**Music questions** policies. Every schedule starts disabled. Each policy has
its own saved interval, message limit, friend scan limit, silence window,
per-person cooldown, greeting or sticker, question variants and priority IDs.
Online-only starts on. Topic defaults to seven days of silence; help and music
default to 31. A zero message limit sends nothing.

Write the topic/help/music question yourself; one variant per line, up to 20
variants of 500 characters. Preview chooses and freezes one variant for each
person. Music also requires an explicit native `audioOWNER_ID_AUDIO_ID` identity.
No reference account's audio is selected for you. The audio is attached by VK;
this feature never downloads or uploads a local audio file.

Preview reads current friendship, account, write permission and complete history
(up to 1,000 messages, reserving space for this sequence). Empty, recent, unread,
protected, opted-out, deactivated or uncertain conversations are held. Lists are
bounded to 10,000 friends, and the configured scan limit bounds per-person reads.
Priority exclusions are shared with the other VK friendship policies.

Confirm the exact ordered review: greeting, optional audio, then question.
Steps are paced 15 seconds apart, with 30 seconds between people. Each send has
its own durable outbox identity and positive native message receipt. Permission,
policy, consent, account and history are rechecked after the provider's actual
rate wait. An unrelated reply, edit or changed attachment stops continuation.
Reviews expire after five minutes. Sent text and audio identity appear in Chat.

A definite partial delivery requires a new manual review. The remaining original
steps keep their payloads and random IDs across restart; acknowledged steps never
repeat. An uncertain send stays held for manual investigation in the outbox.
Scheduling never resumes a partial sequence. Later complete cycles require both
the silence window and cooldown. Stop/shutdown drains owned work.

Foreground commands are `vk-topic`, `vk-help` and `vk-music`, each with
`status|save|plan|run`. Save accepts `--enabled=true|false`, `--every-minutes`,
`--limit`, `--scan-limit`, `--stale-days`, `--cooldown-days`, `--greeting`,
`--sticker-id`, `--questions`, `--online-only=true|false`, `--priority=ID,ID`
and `--audio` for music. Use `--store` to select the local store. After `plan`,
run with `--plan=<returned-id> --confirm=true`; a foreground command does not
start scheduling. The same operations use `/api/vk/topic`, `/api/vk/help` and
`/api/vk/music` with `/plan` and `/run` through both default Lino encodings.
Offline pages can save configuration, but correctly require a local server for
provider reads or sends.

[Implementation and reproducible evidence](case-studies/issue-56/vk-reengage.md).
