# VK friend maintenance

Connections → VK → Manual setup has independent **VK inactive friend cleanup**
and **VK outgoing request cancellation** sections. Both start disabled. Save
priority IDs and limits before preparing review. Priority IDs saved in any of the three VK friend
policies are protected by both maintenance jobs. No personal IDs are imported.

Cleanup reads the complete current friend list, bounded by VK's 10000 supported
friend capacity. Only `banned` or `deleted` accounts are eligible. The effect
limit defaults to 10000, the schedule to 30 minutes, and deletion pacing to five
seconds. Active friends are always kept. Cancellation scans at most the saved
limit of outgoing requests (20 by default), skipping protected priorities
without replacing them with later requests. Its interval defaults to eight
minutes and pacing to three seconds. Limit zero disables effects for either job.

**Prepare review** shows exact account, user IDs, action and exclusions. Manual
**Confirm reviewed removals** consumes only that current five-minute review.
Opting into automatic execution separately authorizes the saved policy on a
connected server. Before each deletion, after the provider rate wait and durable
intent acknowledgement, current account/credential, relationship, priorities,
policy and cleanup deactivation are checked again. A changed input refuses the
batch and requires fresh review. Stopping the server aborts pacing and drains
owned work; command-line operations stay foreground.

```sh
meta-sovereign vk-cleanup status
meta-sovereign vk-cleanup save --limit=20 --priority=123,456
meta-sovereign vk-cleanup plan
meta-sovereign vk-cleanup run --plan=<reviewed-plan-id> --confirm=true
meta-sovereign vk-outgoing save --limit=20 --priority=123,456
meta-sovereign vk-outgoing plan
meta-sovereign vk-outgoing run --plan=<reviewed-plan-id> --confirm=true
meta-sovereign vk-outgoing save --enabled=true --every-minutes=8
```

For each kind, `GET /api/vk/cleanup` or `/api/vk/outgoing` reads policy, plan and
receipts. Trusted-origin POST saves policy; `/plan` prepares it; `/run` requires
`{planId, confirm: true}`. Text and binary Lino are the defaults. Offline primary
accounts can acknowledge saved policy and read retained receipts, but require a
connected server for provider actions. A failed save retains the previous
acknowledged choice.

Only `friends.delete` with `success: 1` and the matching `friend_deleted: 1` or
`out_request_deleted: 1` confirms the requested action. Transport errors,
missing subtype receipts and interrupted outcome persistence stay unknown.
Durable per-account/target records are shared with acceptance/request jobs;
unknown effects are never replayed or retroactively called successful. Confirmed
deletions require a later observed absent relationship before a new relationship
can be acted on. Definite provider refusals stop the batch without write retries.
No messages are sent. This work does not implement incoming rejection, desktop
percentage acceptance, or other separately required reference jobs.
