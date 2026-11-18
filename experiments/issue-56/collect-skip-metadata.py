"""Bind a same-attempt metadata correction to its actual parent and native proof."""
from pathlib import Path
import json
import subprocess
from evidence_bundle import evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
parent = 'c4ebc9de786e62e2dda08e74a9a853ed57c1882d'
source = 'js/src/jobs/vacancy-skip-service.js'
names = [source, 'js/tests/job-vacancy-skips.test.js',
    'js/tests/helpers/e2e-vacancy-skips.mjs',
    'experiments/issue-56/vacancy-skips-native.mjs',
    'experiments/issue-56/vacancy-skip-metadata-before.py',
    'experiments/issue-56/collect-skip-metadata.py',
    'docs/case-studies/issue-56/vacancy-skip-metadata.md', '.jscpd.json']
names += evidence_logs(root, 'vacancy-skip-metadata')
names += [str(p.relative_to(root)) for p in
    (root / 'docs/screenshots/issue-56-skip-metadata').glob('*.png')]
entries = {name: (root / name).read_bytes() for name in names}
entries['before/' + source] = subprocess.check_output(['git', 'show', f'{parent}:{source}'], cwd=root)
assert b'fail 1' in entries['ci-logs/vacancy-skip-metadata-before.log']
assert b'pass 18' in entries['ci-logs/vacancy-skip-metadata-focused.log']
assert b'fail 0' in entries['ci-logs/vacancy-skip-metadata-focused.log']
native = json.loads(entries['ci-logs/vacancy-skip-metadata-native.log'])
assert native['laterLinkPreserved'] and native['providerSubmissions'] == 0 and native['browsersClosed']
assert b'ERROR:' not in entries['ci-logs/vacancy-skip-metadata-duplication.log']
for label in ['lint', 'diff']:
    assert not entries[f'ci-logs/vacancy-skip-metadata-{label}.log'].strip()
write_entries_archive(root / 'docs/case-studies/issue-56/data/vacancy-skip-metadata.tar.gz', entries)
