"""Preserve the exact hosted refusal and finite fixture-only admission repair."""
import json
import subprocess
from evidence_bundle import (
    changed_sources, evidence_context, evidence_logs,
    verify_evidence, write_entries_archive,
)

root, logs, read = evidence_context(__file__, 'batch-admission')
verify_evidence(read, {
    'before': ['pass 0', 'fail 1', 'Another vacancy read owns this workspace.'],
    'focused': ['tests 12', 'pass 12', 'fail 0', 'cancelled 0', 'skipped 0'],
    'deno': ['12 passed | 0 failed'],
    'format-check': ['All matched files use Prettier code style!'],
})
job_name = 'ci-logs/77bd5f71-deno-macos-shard5.json'
job = json.loads((root / job_name).read_text())
assert job['head_sha'] == '77bd5f7129c8c1a628832f0ce63875d5b83875a9'
assert job['conclusion'] == 'failure' and job['id'] == 134457678515
failure_name = 'ci-logs/77bd5f71-deno-macos-shard5.log'
failure = (root / failure_name).read_text()
assert 'Another vacancy read owns this workspace.' in failure
assert '1256 passed' in failure and '1 failed' in failure
names = changed_sources(root) + evidence_logs(root, 'batch-admission')
names += [job_name, failure_name, 'experiments/issue-56/evidence_bundle.py',
          'js/src/jobs/service.js', 'js/src/jobs/acknowledged-store.js',
          'js/src/jobs/application-batch.js',
          'experiments/issue-56/application-batch-fixture.mjs']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = 'c3b491e3'
name = 'js/tests/salary-application-batch.test.js'
entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps(dict(parent=parent, hostedJob=job['id'],
    hostedSource=job['head_sha'], nodePasses=12, denoPasses=12,
    deterministicBeforeFailures=1, maxAdmissionAttempts=200,
    acceptedCriteria=83, unfinishedCriteria=35, issueComplete=False,
    productionChanged=False, hostedVerificationPending=True), indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/batch-admission.tar.gz', entries)
