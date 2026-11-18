"""Retain actual hosted failures and finite warning-transition regressions."""
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, write_entries_archive

root, logs, read = evidence_context(__file__, 'import-resource-warning')
parent = subprocess.check_output(['git', 'rev-parse', '08cf9ee5'], cwd=root).decode().strip()
for name, fragments in {
    'assertions-before': ['pass 2', 'fail 2', 'server_resource_high'],
    'parent-replay': ['expected actual-parent failure'],
    'focused': ['pass 8', 'fail 0', 'skipped 0'],
    'synthetic': ['pass 6', 'fail 0', 'skipped 0'],
    'format-check': ['All matched files use Prettier code style!'],
    'limits': ['Scoped source and documentation limits pass'],
}.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ['lint', 'secrets', 'diff']:
    assert not read(name).strip(), name
names = [*changed_sources(root), *evidence_logs(root, 'import-resource-warning'),
         'experiments/issue-56/parent_replay.py', 'experiments/issue-56/evidence_bundle.py',
         'js/src/server/resource-diagnostics.js', 'js/tests/resource-diagnostics.test.js']
jobs = []
for platform, job_id in [('macos', 135161142778), ('ubuntu', 135161143433)]:
    prefix = f'ci-logs/checks-08cf9ee5-bun-{platform}'
    job = json.loads((root / f'{prefix}-job.json').read_text())
    assert job['id'] == job_id and job['head_sha'] == parent
    assert job['conclusion'] == 'failure' and job['run_id'] == 44405088672
    names.extend([f'{prefix}-job.json', f'{prefix}.log'])
    jobs.append({'id': job_id, 'platform': platform})
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['before/js/tests/worker-import-resources.test.js'] = subprocess.check_output(
    ['git', 'show', f'{parent}:js/tests/worker-import-resources.test.js'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'failedSource': parent, 'failedRun': 44405088672, 'failedJobs': jobs,
    'parentFailures': 2, 'parentIndependentControls': 2, 'focusedPassed': 8,
    'syntheticPassed': 6, 'productionChanged': False, 'localConcurrency': 1,
    'nodeHeapMiB': 384, 'remainingOriginalCriteria': 30, 'issueComplete': False,
    'hostedVerification': 'pending publication',
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/import-resource-warning.tar.gz', entries)
