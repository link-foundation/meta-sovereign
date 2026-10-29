# Issue 54: CI/CD audit and release repair

Issue: https://github.com/link-foundation/meta-sovereign/issues/54

Pull request: https://github.com/link-foundation/meta-sovereign/pull/55

The failing main run published npm 1.0.0, then sent the local Git ref `HEAD` to GitHub's release API. GitHub rejected `target_commitish` with HTTP 422. Desktop packaging subsequently blocked on the failed upstream release; its green resolver job did not mean installers were built. The repair resolves the checked-out, newly versioned commit to a full SHA before release creation and PR lookup. It preserves the conservative publication gate and recovery without republishing npm.

The wider audit also reproduced release-note loss, wrong-version extraction, successful exits after refused API requests, incomplete related-PR metadata, oversized notes, fenced-example truncation, and concurrent npm cache reservation warnings. Changes and failing-before/passing-after evidence are mapped in [ROOT-CAUSES.md](ROOT-CAUSES.md) and [REQUIREMENTS.md](REQUIREMENTS.md).

- [Timeline](TIMELINE.md): exact original run and job timestamps, including publication before failure.
- [Template comparison](TEMPLATE-COMPARISON.md): complete trees, workflow/helper/config roles, applicability and all 17 Hive Mind principles.
- [Validation](VALIDATION.md): focused local reproductions, CI evidence and remaining verification status.
- [Plan](PLAN.md): completion checklist.

## Evidence layout and restoration

`evidence.tar.xz` contains the collected `github/`, `metadata/`, `ci-logs/`, `artifacts/`, `templates/`, `comparison/`, `research/` and `validation/` directories. Raw directories are ignored to keep the PR reviewable; the archive, inventory and reports are committed. `evidence-files.sha256` inventories every member; `evidence.sha256` authenticates both the archive and inventory. Diagnostic ZIPs remain byte-for-byte downloads. Installer binaries are not logs: their artifact names, sizes, digests and URLs are preserved instead of downloading executable publication outputs.

```sh
python3 -B experiments/issue-54/archive.py --verify
tar -xJf dev/log/issues/54/pulls/55/evidence.tar.xz \
  -C dev/log/issues/54/pulls/55
cd dev/log/issues/54/pulls/55
sha256sum -c evidence-files.sha256
```

`experiments/issue-54/collect.py --cited --label LABEL` refreshes the six cited runs and every branch run, paginating run/job/annotation/artifact APIs. `--templates` collects new immutable template snapshots; do not use it when reproducing this recorded comparison. `compare.py` rebuilds inventories and complete text diffs against the materialized snapshots. `archive.py` uses streaming compression and verifies every extracted file. Run it after collectors finish, with its output log outside the directories being archived.

One superseded desktop run, 40840372676, was cancelled before runner allocation (`runner_id=0`, no steps). GitHub returns an empty log ZIP; the original empty ZIP and job metadata are retained rather than inventing an execution log. Other superseded runs retain their available partial logs. All six issue-cited runs have complete logs.

No required sub-issues, issue comments, PR conversations, inline reviews or review submissions existed at initial collection. Their empty API responses are retained; upstream reports below are findings, not unfinished prerequisites delegated out of this PR.

## Upstream reports

- [JavaScript #271](https://github.com/link-foundation/js-ai-driven-development-pipeline-template/issues/271): refused/unknown release and PR lookups produce misleading formatting success.
- [JavaScript #272](https://github.com/link-foundation/js-ai-driven-development-pipeline-template/issues/272), [Python #124](https://github.com/link-foundation/python-ai-driven-development-pipeline-template/issues/124), [Rust #222](https://github.com/link-foundation/rust-ai-driven-development-pipeline-template/issues/222): version headings inside fenced examples truncate notes. JavaScript/Python failures were executed offline; the Rust report explicitly identifies source analysis and supplies a bounded reproduction for its maintainers.

The existing [actionlint syntax report](https://github.com/rhysd/actionlint/issues/711#issuecomment-6492257723) also received our pinned-image reproduction, narrow workaround and parser fix suggestions. The JavaScript lookup report includes a [second-page reproduction](https://github.com/link-foundation/js-ai-driven-development-pipeline-template/issues/271#issuecomment-6492265421).

Each report contains an immutable source reference, minimum reproduction, workaround and suggested code correction. Local equivalents are fixed and covered here; merging upstream reports is outside this repository's acceptance criteria.
