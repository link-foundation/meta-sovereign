"""Preserve the exact Windows cleanup failures and portable boundary regressions."""
from pathlib import Path
import json
import subprocess
from evidence_bundle import evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
parent = 'c4ebc9de786e62e2dda08e74a9a853ed57c1882d'
source = 'experiments/issue-56/vacancy-legacy-fixture.mjs'
names = [source, 'js/tests/vacancy-legacy-lifecycle.test.js',
    'js/tests/vacancy-legacy.test.js', 'js/tests/vacancy-legacy-paths.test.js',
    'experiments/issue-56/legacy-cleanup-before.py',
    'experiments/issue-56/collect-legacy-cleanup.py',
    'docs/case-studies/issue-56/ci-legacy-cleanup.md',
    'ci-logs/hosted-c4ebc9de-checks.json']
names += [f'ci-logs/hosted-c4ebc9de-{job}.log' for job in
    ['134580700737', '134580701099', '134580701104']]
names += evidence_logs(root, 'legacy-cleanup')
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['before/' + source] = subprocess.check_output(['git', 'show', f'{parent}:{source}'], cwd=root)
assert b'fail 2' in entries['ci-logs/legacy-cleanup-before.log']
assert b'pass 17' in entries['ci-logs/legacy-cleanup-focused.log']
assert b'fail 0' in entries['ci-logs/legacy-cleanup-focused.log']
assert b'15 passed | 0 failed' in entries['ci-logs/legacy-cleanup-deno.log']
assert b'15 pass' in entries['ci-logs/legacy-cleanup-bun.log']
assert b'0 fail' in entries['ci-logs/legacy-cleanup-bun.log']
assert b'ERROR:' not in entries['ci-logs/legacy-cleanup-duplication.log']
for label in ['lint', 'diff']:
    assert not entries[f'ci-logs/legacy-cleanup-{label}.log'].strip()
run = json.loads(entries['ci-logs/hosted-c4ebc9de-checks.json'])
assert all(job['head_sha'] == parent for job in run['jobs'])
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-legacy-cleanup.tar.gz', entries)
