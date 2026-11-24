"""Preserve finite offline migration checks and exact preceding CI evidence."""
from pathlib import Path
import hashlib
import io
import json
import subprocess
import tarfile

root = Path(__file__).resolve().parents[2]
changed = subprocess.check_output(
    ['git', 'ls-files', '--modified', '--others', '--exclude-standard', '-z'],
    cwd=root).decode().split('\0')
sources = sorted(set(n for n in changed if n and
                     not n.startswith('docs/case-studies/issue-56/data/')))
names = [str(p.relative_to(root)) for p in sorted(
    (root / 'ci-logs').glob('legacy-follow-*.log'))]
names += [
    'ci-logs/legacy-follow-latest-runs.json',
    'ci-logs/legacy-follow-5cc-run.json',
    'ci-logs/ci-follow-2ccb4b45-42760324383.log',
    'experiments/issue-56/legacy-follow-regression.py',
    'experiments/issue-56/collect-legacy-follow-evidence.py',
]
metadata = {
    'preceding_head': '5cc23d068ab30c936fd0b3f7832400967bdd6153',
    'checks': {'focused_login_checks': 56, 'locale_checks': 28,
               'chromium': 'passed', 'existing_login_chromium': 'passed',
               'mcp': 'before, retained failure, verified recovery and mobile passed',
               'baseline': 'Five core cases and duplicate-click browser assertion fail as expected.'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest() for n in sources},
    'limits': 'SDK-only offline fixtures; no real Telegram credentials or writes. New exact-head CI remains required. FL06–FL09 and every other unchecked issue-wide criterion remain unfinished.',
}
archive = root / 'docs/case-studies/issue-56/data/legacy-follow-sessions.tar.gz'
with tarfile.open(archive, 'w:gz') as tar:
    for name in names:
        tar.add(root / name, arcname=name)
    payload = (json.dumps(metadata, indent=2) + '\n').encode()
    entry = tarfile.TarInfo('metadata.json')
    entry.size = len(payload)
    tar.addfile(entry, io.BytesIO(payload))
with tarfile.open(archive, 'r:gz') as tar:
    hashes = {entry.name: hashlib.sha256(tar.extractfile(entry).read()).hexdigest()
              for entry in tar.getmembers() if entry.isfile()}
assert set(hashes) == set(names) | {'metadata.json'}
for name in names:
    assert hashes[name] == hashlib.sha256((root / name).read_bytes()).hexdigest()
archive.with_suffix('').with_suffix('.tar.sha256.json').write_text(
    json.dumps({'archive': archive.name, 'files': hashes}, indent=2) + '\n')
print(f'Verified {len(hashes)} archive entries and {len(metadata["sources"])} source hashes')
