"""Archive focused offline checks without running the repository-wide matrix."""
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
    (root / 'ci-logs').glob('shared-leave-*.log'))]
names += ['ci-logs/shared-leave-latest-runs.json',
          'experiments/issue-56/shared-leave-regression.py',
          'experiments/issue-56/collect-shared-leave-evidence.py']
metadata = {
    'preceding_head': '2ccb4b457ed5203f8ab25692ab934ec276e98a05',
    'checks': {'focused_tests': 80, 'chromium': 'passed',
               'existing_channel_management_chromium': 'passed', 'mcp': 'passed',
               'before': 'Three receipt cases, one retry probe and the production browser fail as expected.'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest() for n in sources},
    'limits': 'Offline fixtures only, no live writes or full local matrices. New exact-head CI required. FL04, FL06–FL09 and other unchecked issue-wide criteria remain unfinished.',
}
archive = root / 'docs/case-studies/issue-56/data/shared-leave-receipts.tar.gz'
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
