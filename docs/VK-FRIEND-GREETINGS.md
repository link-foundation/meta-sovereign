# VK friend greetings (languages: en • [ru](VK-FRIEND-GREETINGS.ru.md) • [hi](VK-FRIEND-GREETINGS.hi.md) • [zh](VK-FRIEND-GREETINGS.zh.md))

Open **Connections → VK → Enter manually → VK friend greetings**. The service
checks current friends through your configured personal VK API credential.
Offline policy editing remains available, but cannot review or send through VK.
Automatic scheduling starts off; online-only starts on.

Choose your greeting text or a native VK sticker ID. A nonzero sticker replaces
the text. Configure the minimum conversation silence, per-person cooldown,
number of friends to inspect, and greeting limit. Zero greetings performs no
actions. You can restrict the policy to empty conversations or turn off the
online-only filter. Empty chats come first, followed by the oldest conversations;
optional ordering by total friends takes precedence. Priority IDs and the shared
messaging opt-out list always protect their accounts.

Save, then **Review current state** to inspect exact content and eligibility.
Confirmation applies only that reviewed plan, valid for five minutes. The
provider's actual relationship, online state, unread state, write permission,
complete bounded history and account must still match immediately before each
send. Unread conversations, service events, unavailable/partial history and
uncertain deliveries remain held. A conversation over 1,000 messages is held
rather than guessed from its tail. Each batch is bounded to 100 greetings and
10,000 inspected friends, with 30 seconds between actions.

If you enable scheduling, the local application server checks the saved interval
once a minute and owns the background work until shutdown. Quiet hours apply to
scheduled sends. Closing the server stops new work and aborts the spacing wait.
Manual confirmation does not enable automatic scheduling.

The CLI shares the same policy and durable storage:

```sh
meta-sovereign vk-greet status
meta-sovereign vk-greet save --message="Hello, friend." --limit=3 --online-only=true --stale-days=30 --cooldown-days=7
meta-sovereign vk-greet plan
meta-sovereign vk-greet run --plan=THE_REVIEWED_PLAN_ID --confirm
```

The local API is `/api/vk/greet` with `/plan` and `/run` actions. It supports the
default Lino text and binary wire formats, same-origin writes and the same
explicit plan confirmation. It cannot be used to impersonate a scheduled run.

Only a positive native message receipt is labelled acknowledged. Confirmed
greetings are projected into Chat with their actual VK message identity;
stickers retain their native sticker ID. A lost or invalid acknowledgement is
unknown and is not automatically repeated after refresh or restart. A definite
refusal is distinct from unknown delivery. A later new greeting requires another
review and both the saved silence and cooldown periods.
