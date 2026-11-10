"""Preserve the exact-head locale-size failure and focused correction checks."""
from pathlib import Path
import hashlib
import io
import json
import tarfile

root = Path(__file__).resolve().parents[2]
names = [
    'ci-logs/run-42755799003.log',
    'ci-logs/8ff2040c-failed-checks.json',
    'ci-logs/8ff2040c-runs.json',
    'experiments/issue-56/collect-membership-locale-evidence.py',
]
names += [str(p.relative_to(root)) for p in sorted((root / 'ci-logs').glob('ci-membership-locale-*.log'))]
sources = [str(p.relative_to(root)) for p in sorted((root / 'js/src/web/locales').glob('*-chat*.js')) if p.name.split('-')[0] in ('en', 'ru', 'zh', 'hi')]
metadata = {
    'failed_head': '8ff2040c9ddbd501409705908f2304e5a0753fd5',
    'run': 42755799003,
    'created_at': '2026-11-10T04:25:38Z',
    'cause': 'Russian chat dictionary reached 1501 lines; limit is 1500.',
    'correction': 'Extract existing invite preview translations in all four locales without changing keys or values.',
    'checks': {'locale': 25, 'strict_lint': 'passed', 'bundle': 'passed'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest() for n in sources},
    'limits': 'Focused checks only; exact-head CI and all unfinished issue-wide requirements remain required.',
}
archive = root / 'docs/case-studies/issue-56/data/ci-membership-locale.tar.gz'
payload = (json.dumps(metadata, indent=2) + '\n').encode()
with tarfile.open(archive, 'w:gz') as tar:
    for name in names:
        tar.add(root / name, arcname=name)
    entry = tarfile.TarInfo('metadata.json')
    entry.size = len(payload)
    tar.addfile(entry, io.BytesIO(payload))
with tarfile.open(archive, 'r:gz') as tar:
    hashes = {entry.name: hashlib.sha256(tar.extractfile(entry).read()).hexdigest() for entry in tar.getmembers() if entry.isfile()}
assert set(hashes) == set(names) | {'metadata.json'}
for name in names:
    assert hashes[name] == hashlib.sha256((root / name).read_bytes()).hexdigest()
archive.with_suffix('').with_suffix('.tar.sha256.json').write_text(json.dumps({'archive': archive.name, 'files': hashes}, indent=2) + '\n')
print(f'Verified {len(hashes)} archive entries and {len(metadata["sources"])} source hashes')
