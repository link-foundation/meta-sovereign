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

This fixed-batch VK policy is distinct from the desktop reference's requested
top-ten-percent/mutual-only policy, whose separate inventory criterion remains
unfinished. Deletion, outgoing cancellation and request rejection are separate
required features and are not performed by these controls.
