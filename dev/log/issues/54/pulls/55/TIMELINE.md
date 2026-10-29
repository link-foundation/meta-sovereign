# Sequence of events (UTC)

The initial issue and PR snapshots contain no additional comments or required sub-issues. All six cited runs, not only the failed workflow, were preserved with full logs, jobs, annotations and diagnostic artifacts.

| Time on 2026-10-29 unless specified | Event and interpretation |
| --- | --- |
| 2026-10-28 23:55:31 | Dependabot run **40790638881**, `dc30f00`, starts. The managed Docker update succeeds. Its OpenSSL rehash utility warns about the concatenated certificate bundle; this is not a repository TLS failure. |
| 07:18:46 | Checks **40834621624**, security **40834621641**, Pages **40834621599** and links **40834621620** start for source `d14956c`. Pages, links and security succeed. |
| 07:45:09 | The normal release job starts after its required checks. |
| 07:45:42–07:45:50 | Versioning creates and pushes **04f2081bdb48ee37b422a65c112c0e36cb70470d**, version **1.0.0**. This newer metadata commit is the release target; the initial workflow SHA would be stale. |
| 07:45:50–07:50:26 | npm publication and visibility checks run. Temporary absence while the staged version propagates is observed without uploading the same version repeatedly. npm publication succeeds. |
| 07:50:26–07:50:27 | GitHub release creation sends literal `HEAD` as `target_commitish` and fails with **HTTP 422**. Formatting and documentation attachment cannot proceed. |
| 07:50:29–07:50:30 | The release job and overall Checks run finish as failure. Earlier validation passing does not erase this publication failure. |
| 07:50:32 | Desktop **40838023652** starts for the metadata commit `04f2081`. |
| 07:50:35–07:51:17 | Desktop resolve completes with an explicit upstream-failure/blocked-packaging notice. Build and publish jobs are skipped. This is a successful decision to block, not evidence of published installers. |
| 07:58:54–07:59:07 | Prepared placeholder branch/PR is created. Initial docs-only checks do not validate the later implementation. |
| 08:11:28 | First implementation commit `64428d1` triggers fresh branch checks. |
| 08:17:22 | Cache policy commit `cd91295` triggers replacement checks. Superseded read-only runs may be cancelled; cancellation is never counted as a passing result for the replacement SHA. |
| 08:26:37 | `11e0bf9c` starts Checks **40842161874**. Zizmor exposes 11 workspace-relative self-action references; the full failed job log is preserved. |
| 08:47:08 | `6b6685da` starts Checks **40844647863**. GitHub resolves and executes the secure self-repository action, but the older actionlint rejects its syntax. The documented upstream gap is reproduced and fixed with an exact-reference/path compatibility exception and genuine-failure controls. |
| 08:53:13 | `d38c43b8` starts replacement checks, including the pagination repair. All early gates, including both workflow linters, pass; later source review adds protection against commit-shaped code examples. |
| 08:59:29 | `78789d74` starts the complete final implementation checks. Its full SHA and final workflow results are recorded in VALIDATION.md; earlier cancelled runs cannot validate this source. |
| 09:18:35 | The final required browser job, WebKit, completes successfully. Both browsers, all nine runtime/OS combinations and all five desktop build targets have now passed. |
| 09:18:54–09:18:55 | Pipeline status passes and Checks **40846140276** concludes successfully. All five workflows on `78789d74` are successful: 49 passing checks and six expected main-only publication/deployment skips. |

Raw evidence: `metadata/RUN-attempt1.json`, `*-jobs.json`, `*-annotations.json` and `ci-logs/RUN-attempt1.log` inside the archive. The original failure is at **40834621624-attempt1.log:77696–77703**, with the HTTP 422 response at **77700–77702**. The cache reservation collisions appear at lines **19247, 32508, 58223, 76837** in that same log. Dependabot's certificate-bundle warning is at **40790638881-attempt1.log:65**.

Later checkpoints are recorded by exact SHA and timestamp in `metadata/branch-runs-*.json`, `github/runs-*.json` and [VALIDATION.md](VALIDATION.md). A queued replacement run and an earlier successful run are different evidence; neither can substitute for a completed result on the final source.
