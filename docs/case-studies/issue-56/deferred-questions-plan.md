# Durable HH question deferrals (HH05)

Objective: finish every issue-56 requirement in PR57. This unit addresses the
pinned deferred-question policy; it does not accept the complete HH05 criterion.

- [x] Read pinned deferred-question matching, persistence, waiting-form and
      later-answer eligibility behavior; inspect current session queue and
      acknowledged writer ownership. The session queue currently disappears
      on restart and cannot hold a matching unanswered question in later runs.
- [x] Draft a bounded private question policy with exact-revision owner changes,
      durable vacancy associations and answer-aware eligibility. Preserve the
      separate worker-only no-questionnaire queue and actual recovery drafts.
- [x] Expose explicit defer/list/save/clear through CLI, both Lino protocols and
      four-language controls. Recheck held forms when policy changes without
      submitting, filling owner controls or replaying uncertain delivery.
- [x] Reproduce the published-parent gap, run focused bounded tests with one
      worker, and verify actual native/MCP before/after screenshots and cleanup.
- [x] Pass scoped static gates and preserve source-bound evidence with an
      independently verified manifest. The unchanged duplication gate passes
      at 6.50%; source and document limits pass.
- [ ] Commit/push only the prepared branch and review exact-source hosted
      workflows. Every original unchecked criterion remains required.
