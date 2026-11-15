# VK friend requests

Open Connections → VK → Manual setup → VK friend requests. Save your own
priority user IDs, friend capacity and incoming batch size. Scheduling starts
disabled, with a 20-minute interval, capacity 10000, incoming batch 23 and no
priority IDs. A saved VK user token with friend permissions is required.

Prepare review reads current account identity, friend count, mutual-ranked
incoming requests and relationship statuses. Priority IDs come first. Already
friends, pending outgoing requests, your own account and uncertain previous
actions are excluded. Each proposed request or acceptance reserves a slot.
Confirm reviewed friend actions consumes that exact five-minute plan once.
Changing saved policy, account, credential, relationship or capacity refuses
the action and requires fresh review. Every action rechecks after its rate
limiter and durable intent write. Successful actions are paced ten seconds
apart. No messages are sent.

Opting into automatic runs authorizes that saved policy while the connected
server runs. The owned minute timer checks the saved interval; stopping the
server cancels pacing and drains owned work. The last batch attempt throttles
restart. CLI operations stay foreground and never launch a daemon.

```sh
meta-sovereign vk-friends status
meta-sovereign vk-friends save --priority=123,456 --max-friends=10000 --batch-size=23
meta-sovereign vk-friends plan
meta-sovereign vk-friends run --plan=<reviewed-plan-id> --confirm=true
meta-sovereign vk-friends save --enabled=true --every-minutes=20
```

`GET /api/vk/friends` returns saved policy, plan and last batch. Trusted-origin
`POST /api/vk/friends` saves policy; `/plan` prepares review; `/run` requires
`{planId, confirm: true}`. Text and binary Lino remain the default encodings.
Offline clients can save policy and inspect receipts, but provider action
buttons stay unavailable. Only the primary local account is supported there.

VK receipts distinguish request sent (1), incoming request accepted (2) and
request resent (4). Rate/permission refusals stop the batch without mutation
retry. A lost or unconfirmed response stays unknown and prevents automatic
replay for that target, including after restart. Failed outcome persistence
retains durable pending intent as unknown. Confirmed actions also wait for a
later provider observation before a new relationship can be acted on; a stale
incoming list cannot replay an acknowledged action. Provider observations do
not retroactively claim that an uncertain action succeeded. Other targets
remain independently eligible in later fresh plans.

The incoming acceptance policy defaults to Ranked batch. Its configured capacity
continues to limit all friend actions. Selecting Desktop: lifetime top ten percent
saves a separate policy with a mutual-only threshold instead. Below that threshold,
nonpriority incoming requests qualify in descending mutual-friend order while
`floor(distinct observed requesters / 10) - confirmed or reserved attempts` is
positive. Repeated reviews, restart and changing modes do not replenish this
account-bound allowance. At or above the configured threshold, only incoming
requests with positive mutual-friend counts qualify; that branch does not require
below-threshold allowance. VK's absolute 10,000-friend limit applies to both modes.

Priority requests come first, spend no desktop allowance and remain protected
by both [maintenance policies](VK-FRIEND-MAINTENANCE.md). Current mutual counts
appear in the review. A change in mutual count or a crossing of the threshold
requires another review. The desktop allowance is reserved durably before the
final action guard. Definite refusals release that attempt's reservation;
confirmed, unknown and unpersisted outcomes retain it. Observed IDs and attempts
have a finite 100,000-entry review bound; reaching it stops automation rather
than discarding history to create more allowance.

```sh
meta-sovereign vk-friends save --acceptance-policy=desktop-ten-percent --max-friends=9000
meta-sovereign vk-friends plan
meta-sovereign vk-friends run --plan=<reviewed-plan-id> --confirm=true
meta-sovereign vk-friends save --acceptance-policy=ranked-batch
```

The pinned desktop selector returns before its above-capacity branch can run.
The requested mutual-only behavior therefore uses an explicit soft threshold,
with the provider limit still enforced. This interpretation is visible in the
controls and [verification evidence](case-studies/issue-56/vk-desktop-policy.md).
These controls send no messages and perform no friend deletion, cancellation or
incoming rejection.
