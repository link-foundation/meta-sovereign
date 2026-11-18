# Shared evidence archive writer

[PR #57](https://github.com/link-foundation/meta-sovereign/pull/57), issue #56.

Checks run [43245201058](https://github.com/link-foundation/meta-sovereign/actions/runs/43245201058)
started on `242d4ccddff0faf2ff53207e71125478b68dddf8` at
2026-11-12 15:12:04 UTC. The lint job failed on the existing duplication gate:
41,084 duplicated lines / 629,179 analyzed lines = 6.5298%, above 6.5%.
The preserved full log records the totals and exit at lines 16377–16382.
Formatting passed; five unrelated ESLint warnings were nonfatal. The remaining
four workflows passed on this exact head. Dependent Checks jobs were skipped.

Fourteen finite evidence collectors repeated the same deterministic gzip/tar,
entry hashing and manifest verification tail. They now share
`write_hashed_archive` in `experiments/issue-56/evidence_bundle.py`. Selection,
metadata, missing-file refusal and reporting remain in each collector. No
threshold, exclusions or historical archive bytes change.

Run `python3 -B experiments/issue-56/verify-evidence-archive.py` to compare with
the original writer retained inside the published export-defaults archive.
Four bounded cases cover empty entries, duplicate names, binary/Unicode bytes,
sorted inputs and a missing source. Gzip bytes, manifest bytes, printed output
and refusal agree. The existing hosted evidence verification step runs this
comparison; twenty focused Node workflow contracts and workflow policy pass.

The same static duplication scan now passes at approximately 6.47%, with the
unchanged configuration. The initial failing scan, final scan totals, complete
workflow log, exact-head metadata, changed sources and verification logs are
retained in [the evidence archive](data/ci-evidence-duplication.tar.gz) and its
[hash manifest](data/ci-evidence-duplication.tar.sha256.json).

This corrects the observed CI failure. New-head hosted checks, workplace
identity/editing/copy/detach, durable batches, bilingual provider writes and
every unchecked issue criterion remain unfinished. PR #57 stays draft and
unmerged.
