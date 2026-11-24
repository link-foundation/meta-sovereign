"""Preserve pending-import observations without attributing the hosted delay."""
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, write_entries_archive

root, logs, read = evidence_context(__file__, 'worker-import-resources')
parent = 'f34c800a53b6a2c7337677dc81c477642f88bfa7'
for name, fragments in {
    'bootstrap-before': ['pending-import resource observation', '0 !== 1', 'pass 1', 'fail 1'],
    'client-before': ['7 !== 10', 'fail 1'],
    'focused': ['pass 14', 'fail 0', 'skipped 1'],
    'deno-startup': ['initial host ready after 5668 ms', 'import_resources_final',
                     'cpu_percent=101.9', 'ok | 1 passed | 0 failed', '"code":0'],
}.items():
    assert all(fragment in read(name) for fragment in fragments), name
for name in ['lint-final', 'secrets', 'diff']:
    assert not read(name).strip(), name
assert 'All matched files use Prettier code style!' in read('format-check')

failed = json.loads((logs / 'worker-import-resources-failed-run.json').read_text())
following = json.loads((logs / 'worker-import-resources-following-run.json').read_text())
job = json.loads((logs / 'worker-import-resources-windows-pass.json').read_text())
assert failed['id'] == 44390156114
assert failed['head_sha'] == 'aa095a981ff47e0c2e099f0fd4cc6b34290da10d'
assert following['id'] == 44392503456 and following['head_sha'] == parent
assert job['id'] == 135121992166 and job['conclusion'] == 'success'

failure_log = 'ci-logs/checks-aa095a98-deno-windows-2.log'
success_log = 'ci-logs/checks-f34c800a-deno-windows-2.log'
assert 'initial host readiness after 10261 ms' in (root / failure_log).read_text()
assert 'initial host ready after 5750 ms' in (root / success_log).read_text()
names = [*changed_sources(root), *evidence_logs(root, 'worker-import-resources'),
         failure_log, success_log, 'ci-logs/checks-aa095a98-deno-windows-2.json',
         'ci-logs/checks-f34c800a-deno-windows-2-phases.log',
         'ci-logs/worker-import-f34-graph.json', 'ci-logs/rolling-startup-f34-deno.log']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in ['js/bin/server-worker.js', 'js/src/server/worker-client.js',
             'js/src/server/resource-diagnostics.js']:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'{parent}:{name}'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'implementationParent': parent,
    'failedRun': failed['id'], 'failedJob': 135108320789,
    'followingRun': following['id'], 'followingPassingJob': job['id'],
    'nodePassed': 14, 'nodeSkipped': 1, 'denoProductionScenarios': 1,
    'maximumPeriodicSamples': 30, 'readinessBudgetMs': 10000,
    'windowsCauseEstablished': False, 'performanceCorrectionEstablished': False,
    'acceptedCriteria': [], 'remainingOriginalCriteria': 30, 'issueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-import-resources.tar.gz', entries)
