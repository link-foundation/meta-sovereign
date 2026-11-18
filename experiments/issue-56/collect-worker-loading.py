"""Preserve observed Windows startup timing separately from its unproven cause."""
import json
from evidence_bundle import changed_sources, evidence_context, evidence_logs, verify_evidence, write_entries_archive
import subprocess

root, logs, read = evidence_context(__file__, 'worker-loading')
parent = '484a6b5141e4e58df0ab5070853c47d221c2cb4b'
verify_evidence(read, {
    'bootstrap-before': ['The pending module load must be observable', 'fail 1'],
    'client-before': ['3 !== 5', 'fail 1'],
    'node-final': ['pass 9', 'fail 0', 'skipped 1'],
    'deno-final': ['10 passed | 0 failed'],
    'startup-profile': ['initial host ready after 4413 ms', 'import_started after',
                        'import_finished after', 'control_ready', '"code":0'],
}, empty=('lint-final', 'diff'))
job = 'ci-logs/ci-deno-windows-43922788772-133498912762.log'
raw = (root / job).read_text()
assert len(raw.splitlines()) == 6008
assert 'initial host readiness after 10117 ms' in raw and 'release_ready after 6705 ms' in raw
assert 'ENOENT' in raw and '2243 passed' in raw
names = [*changed_sources(root), *evidence_logs(root, 'worker-loading'), job,
         'ci-logs/0e-main-jobs-refresh.json', 'ci-logs/current-ci-runs.json']
entries = {name: (root / name).read_bytes() for name in names}
for name in ['js/bin/server-worker.js', 'js/src/server/worker-client.js']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'implementationParent': parent, 'failedHead': '0e50881450121bedb200a85e0bb7e4fff0eacc9f',
    'run': 43922788772, 'job': 133498912762, 'createdAt': '2026-11-16T17:51:44Z',
    'nodePass': 9, 'denoPass': 10, 'realProductionCliScenarios': 1,
    'newRegressionChecks': 2, 'readinessBudgetMs': 10000,
    'windowsCauseEstablished': False, 'criterionAccepted': False,
    'originalUnchecked': 60, 'issueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-worker-loading.tar.gz', entries)
