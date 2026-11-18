# VK history retention

Use Connections → VK → VK history retention. Scheduling is disabled initially. Enter explicit peer IDs, a strict message-count threshold and a scan limit above that threshold. Negative peer IDs and group chat IDs are accepted. Protected absolute peer IDs and the global opt-out list are held.

Review shows the account, configured histories, provider message count, matching local message count and retained deletion receipts. Confirm only the displayed review; changed settings, credentials, account, history, local content or an expired review refuse. Histories over the finite scan limit are held without deletion.

The current messages.deleteConversation method clears history for this account. Only explicit VK error 3 (unsupported method) permits fallback to messages.delete using reviewed cmids, delete_for_all=0 and batches of at most 100, two seconds apart. A timeout, lost reply or invalid acknowledgement never triggers fallback or automatic replay. Positive receipts must agree with provider readback before local clearing.

Partial work retains acknowledged IDs and receipts. Restart and review manually to finish only the remaining original messages; scheduling cannot resume a partial deletion. Local records are matched by provider ID, peer, text and timestamp. They become recoverable tombstones, retaining their content and causal synchronization behavior. Unreviewed local records and other providers remain untouched; this operation never physically purges data.

Foreground CLI:

```sh
meta-sovereign vk-retention save --peers=9,-12 --threshold=1000 --scan-limit=2000 --enabled=false
meta-sovereign vk-retention plan
meta-sovereign vk-retention run --plan=<reviewed-plan-id> --confirm=true
meta-sovereign vk-retention status
```

`/api/vk/retention` · `POST /plan` · `POST /run` · Lino text / binary.
