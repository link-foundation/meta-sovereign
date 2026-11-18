"""Preserve exact failed jobs and canonical-path regression evidence."""
from pathlib import Path
import json
import subprocess
from evidence_bundle import changed_sources, evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
parent = 'e2acf88a7bdee8ba4df94015036b612463e7ebed'
names = changed_sources(root) + evidence_logs(root, 'runtime-cache-paths')
names += [str(p.relative_to(root)) for p in (root / 'ci-logs').glob('hosted-e2acf88a-*.log')]
names += ['ci-logs/hosted-verification-e2acf88a-checks.json', 'ci-logs/latest-runs-e2acf88a-final.json', '.jscpd.json']
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in names:
    if name.startswith(('js/src/', 'js/tests/')) and subprocess.run(
        ['git', 'cat-file', '-e', f'{parent}:{name}'], cwd=root,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'{parent}:{name}'], cwd=root)
assert 'fail 3' in entries['ci-logs/runtime-cache-paths-before.log'].decode()
assert 'pass 45' in entries['ci-logs/runtime-cache-paths-focused.log'].decode()
assert 'fail 0' in entries['ci-logs/runtime-cache-paths-focused.log'].decode()
assert '23 passed | 0 failed' in entries['ci-logs/runtime-cache-paths-deno.log'].decode()
for label in ['lint', 'diff']:
    assert not entries[f'ci-logs/runtime-cache-paths-{label}.log'].strip()
assert 'ERROR:' not in entries['ci-logs/runtime-cache-paths-duplication.log'].decode()
run = json.loads(entries['ci-logs/hosted-verification-e2acf88a-checks.json'])
assert run['headSha'] == parent
entries['metadata.json'] = json.dumps({'failedSource': parent, 'localNodePass': 45,
    'localDenoPass': 23, 'acceptanceChanged': False, 'batchBrowserTimeout': 'separate unresolved investigation'}, indent=2).encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/runtime-cache-paths.tar.gz', entries)
