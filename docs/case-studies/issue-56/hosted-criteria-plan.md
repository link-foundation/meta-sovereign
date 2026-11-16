# Hosted acceptance audit

Keep the complete issue 56 objective active in
[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57). Passing CI
does not complete a criterion without its original behavior and regression
evidence. This audit concerns VK23–VK26, VD08 and VD11–VD15. The later
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
- [x] Include the runner confirmation archive in the source comparison and
      require its named portable checks plus all five shared token/runner
      browser scenarios on both engines. Allow the source audit to select a
      published revision while later documentation is being prepared.
- [x] Read the complete live log pipeline, redactor, inert error formatter,
      bounded journal, origin/passcode admission, Lino/CLI readers, view lifecycle,
      four-language states and owned clipboard bridge. Include the original
      redaction/clipboard regressions and asynchronous native correction as
      VD08 evidence; require their portable, browser and native receipts.
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
workflow was superseded; neither revision satisfies the acceptance gate.
Published `b61cf5fd` includes the runner confirmations and private checkpoint
timing diagnostics. Its Windows checkpoint now passes with all 28 bounded
operations completed. The main workflow nevertheless fails in the
[CV experience fixture](ci-cv-experience-page-errors.md). WebKit shard 4 passes;
that does not establish either earlier failure's cause. This source cannot satisfy the gate. Require all five
positive workflow receipts for the corrected published source before accepting
any row; later documentation does not replace the audited source SHA.
