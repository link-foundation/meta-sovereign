"""Preserve both complete hosted startup logs and the bounded diagnostic checks."""
import json
import subprocess
from evidence_bundle import (
    changed_sources, evidence_context, evidence_logs, verify_evidence,
    write_entries_archive,
)

root, logs, read = evidence_context(__file__, 'ci-worker-startup')
verify_evidence(read, {
    'before': ['ℹ pass 2', 'ℹ fail 2', 'ℹ skipped 1'],
    'focused': ['ℹ pass 7', 'ℹ fail 0', 'ℹ skipped 1'],
    'deno-focused': ['8 passed', '0 failed'],
    'deno-cli-final': ['1 passed', '0 failed', 'spawn_returned', 'spawned',
                       'init_written', 'stdout_received', 'init_finished'],
    'format-final': ['All matched files use Prettier code style!'],
})
assert not read('hosted-source-comparison').strip()
identities = {}
for revision, job, conclusion in (
    ('b4cf', 134766269933, 'failure'), ('9da8', 134774752086, 'success'),
):
    name = f'ci-{revision}-deno-windows-2'
    metadata = json.loads((logs / f'{name}-job.json').read_text())
    assert metadata['id'] == job and metadata['conclusion'] == conclusion
    raw = (logs / f'{name}.log').read_text()
    if conclusion == 'failure':
        assert 'initial host readiness after 10363 ms' in raw
        assert 'CLI host did not start' in raw
    else:
        assert 'initial host ready after 5922 ms' in raw
    identities[revision] = metadata
names = set(changed_sources(root)) | set(evidence_logs(root, 'ci-worker-startup'))
names.update(f'ci-logs/ci-{revision}-deno-windows-2{suffix}'
             for revision in ('b4cf', '9da8') for suffix in ('.log', '-job.json'))
names.update({'js/tests/rolling-cli.test.js', 'js/tests/helpers/rolling-cli-readiness.mjs',
              '.github/workflows/release.yml', 'experiments/issue-56/evidence_bundle.py'})
entries = {name: (root / name).read_bytes() for name in sorted(names)}
parent = 'aa890cda81bf5e2d9a7f5fb6a8e9d5545818e749'
entries['before/js/src/server/worker-client.js'] = subprocess.check_output(
    ['git', 'show', f'{parent}:js/src/server/worker-client.js'], cwd=root)
entries['metadata.json'] = (json.dumps({
    'parent': parent, 'hostedJobs': identities,
    'historicalRootCauseEstablished': False, 'readinessBudgetMs': 10000,
    'acceptedInventoryRows': [], 'issueComplete': False,
}, indent=2) + '\n').encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-worker-startup.tar.gz', entries)
