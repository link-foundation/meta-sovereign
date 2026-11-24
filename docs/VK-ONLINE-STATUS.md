# VK online status

Connections → VK → Manual setup offers a separately enabled online-status
schedule. It starts disabled and defaults to the pinned example's 14-minute
interval. Choose an integer from 1 to 14 minutes and save it. The connected
server checks due work each minute, using the saved attempt time across
restart. Failed attempts also wait for the interval. Turning the schedule off
prevents subsequent scheduled calls; an already admitted request can finish.
The server drains owned requests and clears its timer when it closes.

VK's `account.setOnline` requires a saved **user** access token and marks that
user online for 15 minutes. This changes visible presence without sending a
message. The explicit **Mark online now** action works even while scheduling
is off. Overlapping calls within the same service instance share one attempt.
Provider refusal, transport uncertainty and positive acknowledgement have
distinct saved outcomes. A confirmed timestamp records the last acknowledged
refresh; it does not promise that the account is currently online.

The server acknowledges a pending intent before contacting VK. If this write
fails, it makes no call. If the outcome cannot be saved after a call, the
pending intent reads as unknown, including after restart. Settings and status
keep their last acknowledged values when a write fails. Stored diagnostics
remove credentials. No provider operation is simulated in the offline UI:
it can save a schedule but explicitly says scheduling is inactive there and
disables the immediate action.

```sh
meta-sovereign vk-online --store=/path/to/workspace
meta-sovereign vk-online --enabled=true --every-minutes=14 --store=/path/to/workspace
meta-sovereign vk-online --run=true --store=/path/to/workspace
meta-sovereign vk-online --enabled=false --store=/path/to/workspace
```

Status opens the workspace read-only. The CLI runs only the explicitly
requested foreground action, closes its store and returns nonzero for a
refused or unknown result. Saving configuration does not start a daemon.
`GET /api/vk/online` reads configuration/status; `POST /api/vk/online` saves
`{ enabled, everyMinutes }`; `POST /api/vk/online/run` explicitly refreshes
presence. Mutations require the existing trusted app origin policy. Both
default text/binary Lino encodings share these routes; JSON remains opt-in.

[Evidence and limitations](case-studies/issue-56/vk-online.md) are tracked in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57).
