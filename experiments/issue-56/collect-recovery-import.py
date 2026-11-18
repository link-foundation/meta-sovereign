"""Retain actual fixture failures separately from the earlier readiness refusal."""
import json
import subprocess
from evidence_bundle import changed_sources, evidence_context, evidence_logs, verify_evidence, write_entries_archive

root, logs, read = evidence_context(__file__, 'recovery-import')
parent = '36d41ffb916fdaa17b4cb75c36730e4c694e354b'
verify_evidence(read, {
    'node-before': ['Cannot find module', 'rolling-worker.js', 'fail 1'],
    'node-after': ['pass 2', 'fail 0'],
    'deno-after': ['2 passed | 0 failed'],
}, empty=('lint-final', 'diff'))
jobs = json.loads((logs / 'recovery-import-f09-jobs.json').read_text())['jobs']
failed = [job for job in jobs if job['conclusion'] == 'failure']
assert len(failed) == 8
windows = 'ci-deno-windows-43928621395-133522615996.log'
raw_names = [windows if job['id'] == 133522615996 else f"ci-f09-{job['id']}.log"
             for job in failed]
for name in raw_names:
    raw = (logs / name).read_text()
    assert 'rolling-worker.js' in raw and 'an upgrade can replace a build' in raw
    assert 'Cannot find module' in raw or 'Module not found' in raw
raw = (logs / windows).read_text()
assert 'initial host ready after 6905 ms' in raw
assert 'import_started after 1620 ms' in raw and 'import_finished after 3344 ms' in raw
names = [*changed_sources(root), *evidence_logs(root, 'recovery-import'),
         *[f'ci-logs/{name}' for name in raw_names],
         'js/bin/server-worker.js', 'js/src/server/worker-client.js']
entries = {name: (root / name).read_bytes() for name in names}
entries['before/js/tests/rolling-host.test.js'] = subprocess.check_output([
    'git', 'show', f'{parent}:js/tests/rolling-host.test.js'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'implementationParent': parent,
    'failedHead': 'f09c8d2b0199e6693a9bfe22471e9b3ad81c5009',
    'run': 43928621395, 'reviewedFailingJobs': len(failed),
    'nodePass': 2, 'denoPass': 2, 'productionChanges': False,
    'windowsReadinessPassed': True, 'olderTimeoutCauseEstablished': False,
    'criterionAccepted': False, 'originalUnchecked': 60, 'issueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-worker-fixture-imports.tar.gz', entries)
