# VK person consent at independent policy admission

Explicit `source: vk, contact: <user>` opt-outs were saved correctly, but thirteen
independent policy variants supplied only a chat identity to their preview and
final safety checks. Friendship and maintenance policies omitted shared opt-outs
entirely. Personal message drafts also lost the contact identity before entering
the outgoing queue and shared outbox. A chat opt-out regression therefore did
not demonstrate person consent across these paths.

Use one private-peer safety target for previews, final policy admission and
message drafts. Only positive VK private-user IDs below the group-peer boundary
identify a person. Retain negative community and group-peer identities as chats.
Relationship actions now recheck shared consent before and after fresh provider
state reads, including the actual provider rate wait before durable admission.

The finite adapter fixture exercises cancelled follow-ups, greetings, birthdays,
topic/help/music sequences, incoming/priority friendship, cleanup, outgoing
cancellation, suggestions, community discovery, rejections and retention. Each
variant must have an eligible positive baseline. Revoking person consent before
preview, after review or inside the actual provider wait must produce zero
provider effects. Foreign-provider controls retain confirmed effects; message
receipts must carry the same private-user contact identity as their chat.
Separate positive cases retain a same-numbered community wall, negative retention
peer and group retention peer.

Reproduce against parent `fe44affd` without live credentials or network effects:

```sh
python3 -B experiments/issue-56/probe-vk-person-consent.py
```

The final 55-check file produces **45 failures and 10 passes** on that parent:
39 consent failures and six missing outbox contact identities. The earlier
52-check probe, before adding outbox identity and non-private peer assertions,
produced 39 failures and 13 passes. Both logs are preserved separately. The probe
restores every temporarily replaced production source in `finally`.

After correction, **107 focused checks pass**, with zero failures, cancellations
or skips and one worker:

```sh
node --max-old-space-size=256 --test --test-concurrency=1 \
  js/tests/vk-person-consent.test.js \
  js/tests/vk-greet-guards.test.js js/tests/vk-reengage-guards.test.js \
  js/tests/vk-friends.test.js js/tests/vk-maintenance.test.js \
  js/tests/vk-retention-guards.test.js js/tests/vk-discovery-guards.test.js
```

The archive collector retains exact parent sources, the final fixture and tests,
all finite verification logs, bundle hash and an independently checked hash
manifest. Shared queue pacing, definite/uncertain receipts and existing review
requirements remain covered by the focused existing guard tests. Full QA19/QA20
acceptance and exact-source hosted verification remain required: **83 of 118
criteria are accepted and 35 remain unfinished**. [PR #57](https://github.com/link-foundation/meta-sovereign/pull/57)
stays draft and unmerged.
