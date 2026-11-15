# Reviewed VK friend discovery

Connections → VK has three independent policies. Scheduling starts disabled.
Each policy has its own interval, maximum actions, protected IDs, review and
receipts. Preparing a review performs provider reads and saves that review;
relationship changes require **Confirm reviewed relationship actions**.

- **Best suggestions** inspects at most 100 mutual-friend suggestions. It ranks
  current permitted profiles by mutual-friend count, then numeric ID. Posting,
  viewing, messaging, friend-request permission and access must all be present.
- **Community friend discovery** inspects a configured finite member window.
  Enter your community ID and offset; choose online, photo, public-profile and
  sex filters (0 any, 1 female, 2 male). No personal community is preselected.
  The review shows the inspected count, provider total and offset. Additional
  windows require another review. Membership is checked again before sending.
- **Deactivated incoming requests** inspects up to the configured request bound
  (maximum 10,000). Only current incoming requests from currently banned or
  deleted accounts qualify. Active accounts remain untouched. A generic delete
  success or a removed-friend receipt does not confirm request rejection.

New requests from the first two policies share 40 durable attempt reservations
per account and UTC day. A reservation is saved before issuance; refusal, an
uncertain response or a later cancelled admission does not restore it. This
conservative allowance survives restart. Run limit 0 authorizes no changes.
Friend capacity 0 holds every new request. New requests are paced at three
seconds for suggestions and five for community discovery; rejections use ten.
VK error 8 holds discovery for 24 hours; captcha/rate errors 14/29 hold it for
one hour. Provider pauses survive restart.

Protected IDs from every shared VK friend policy and global opt-outs apply.
Review validity is five minutes. Credentials, account, policy, date, profile,
relationship, mutual count or membership changes require a fresh review.
Stop drains admitted work and prevents later writes. Each native action needs
a positive provider receipt; an unknown result is held in the shared journal
and cannot replay through another friendship policy after restart.

Existing **inactive friend cleanup**, **friend requests** and **outgoing request
cancellation** reviews also inspect current friends, incoming and outgoing
requests. Preparing those reviews changes no provider relationship. Cleanup inspects the complete supported friend list (up to 10,000).
Outgoing review scans up to its configured limit (maximum 10,000); set that
limit explicitly to inspect a larger request list without confirming changes. The deactivated-request review offers finite incoming
pagination independently of the existing ranked acceptance batch.

The same policies are available through `meta-sovereign vk-suggestions`,
`vk-community` and `vk-rejections` with `status`, `save`, `plan` and
`run --plan <review-id> --confirm`. For example:

```sh
meta-sovereign vk-community save --community-id 55 --scan-limit 100 --limit 1
meta-sovereign vk-community plan
meta-sovereign vk-community run --plan <review-id> --confirm
```

Use the printed review ID. `/api/vk/suggestions`, `/api/vk/community` and
`/api/vk/rejections` use the default Lino text/binary transport and same-origin
review confirmation. Browser-only mode saves settings locally and reports that
provider actions need a connected server. Synthetic verification does not prove
that a particular live VK account has API permissions.

See [the implementation plan](case-studies/issue-56/vk-discovery-plan.md).
The separate paced outgoing-message queue remains required by VK26; these
friendship policies do not satisfy that queue criterion.
