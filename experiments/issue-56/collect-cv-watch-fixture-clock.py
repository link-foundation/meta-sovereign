"""Preserve both Windows failures and the finite fixture-clock regression."""
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, write_entries_archive

root, logs, read = evidence_context(__file__, 'cv-watch-fixture-clock')
parent = subprocess.check_output(['git', 'rev-parse', '623a144c'], cwd=root).decode().strip()
for name, fragments in {
    'clock-before': ['pass 1', 'fail 1', 'jobs-cv-readback-timeout', 'jobs-cv-mismatch'],
    'parent-replay': ['expected actual-parent failure'],
    'focused': ['pass 40', 'fail 0', 'skipped 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['Scoped source and documentation limits pass'],
}.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ['lint', 'secrets', 'diff']:
    assert not read(name).strip(), name
names = [*changed_sources(root), *evidence_logs(root, 'cv-watch-fixture-clock'),
         'experiments/issue-56/parent_replay.py', 'experiments/issue-56/evidence_bundle.py',
         'js/src/jobs/cv-save-cycle.js', 'js/tests/cv-save-watch.test.js',
         'js/tests/cv-save-deadline.test.js']
for job_id in [135175316364, 135175317099]:
    prefix = f'ci-logs/checks-623a144c-{job_id}'
    job = json.loads((root / f'{prefix}-job.json').read_text())
    assert job['id'] == job_id and job['head_sha'] == parent
    assert job['conclusion'] == 'failure' and job['run_id'] == 44409144537
    assert (root / f'{prefix}.log').stat().st_size > 100000
    names.extend([f'{prefix}-job.json', f'{prefix}.log'])
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['before/experiments/issue-56/cv-watch-fixture.mjs'] = subprocess.check_output(
    ['git', 'show', f'{parent}:experiments/issue-56/cv-watch-fixture.mjs'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'failedSource': parent, 'failedRun': 44409144537,
    'failedJobs': [135175316364, 135175317099],
    'parentFailures': 1, 'parentControls': 1, 'focusedPassed': 40,
    'productionChanged': False, 'localConcurrency': 1, 'nodeHeapMiB': 384,
    'remainingOriginalCriteria': 30, 'issueComplete': False,
    'hostedVerification': 'pending publication',
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/cv-watch-fixture-clock.tar.gz', entries)
