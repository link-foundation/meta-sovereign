# Hosted acceptance audit

Keep the complete issue 56 objective active in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57). Passing CI
does not complete a criterion without its original behavior and regression
evidence. This audit concerns VK23–VK26 and VD11–VD15. The later
outgoing queue, first-live history and foreground ownership corrections now
provide VK23's previously missing outgoing-message mapping and VK26's integration
evidence. VK24 retains an unresolved earlier WebKit reload failure; passing a
later run alone cannot establish its cause or complete that criterion.

- [x] Read the complete pinned desktop requirements, stats implementation and
      the six implementation records. Verify all bytes in their six archived
      evidence manifests without unpacking archives onto disk.
- [x] Compare current production sources with the preserved implementation
      sources. Review later integration, legacy-list, diagnostics and shared
      transport changes; retain the bounded source diff.
- [x] Read the complete pinned discovery scripts, runner, trigger executor,
      durable store and outgoing queue. Verify the five additional discovery,
      trigger, queue, first-live history and foreground lifecycle archives, then
      compare the preserved sources with the current implementation.
- [x] Review the token acquisition, registration and Electron readiness
      corrections, including the real-window fixture. The exact-head desktop
      Linux x64 job positively passes native authorization isolation; preserve
      its log alongside the portable and browser receipts before acceptance.
- [ ] Preserve all five workflow responses for the next published source,
      including exact SHA, timestamps, every job and step. Investigate any
      failed or cancelled job from its downloaded log before acceptance.
- [ ] Verify the portable tests and mandatory browser scenarios actually ran
      on the published source. Preserve named test receipts and the resolved
      JavaScript CodeQL result, including the earlier VK cache assertion fix.
- [ ] Map each original criterion to implementation, reproducing regression,
      CLI, both Lino transports, shared UI and hosted evidence. Mark only
      criteria with complete evidence; keep provider fixtures labelled synthetic.
- [ ] Publish the checked acceptance archive and update the inventory, case
      study and PR. Keep every other unfinished requirement active and PR57
      draft and unmerged. Check CI again for the resulting commit.

The earlier `5936c544` retry was superseded by later commits. Published
`a493e1cf` passes the desktop, Pages, security and link workflows, but its
[Windows private pause checkpoint test timed out](ci-lino-pause.md). Its main
workflow is still pending; neither revision satisfies the acceptance gate.
The locally committed runner confirmations also change the shared Settings
surface. Refresh the source audit after publishing them and require hosted
receipts for that source before accepting any row.
