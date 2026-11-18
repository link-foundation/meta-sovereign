"""Archive finite offline Follow checks with the exact source hashes used."""
from pathlib import Path
import hashlib
import io
import json
import subprocess
import tarfile

root = Path(__file__).resolve().parents[2]
changed = subprocess.check_output(
    ['git', 'ls-files', '--modified', '--others', '--exclude-standard', '-z'],
    cwd=root,
).decode().split('\0')
sources = sorted(set(n for n in changed if n and not n.startswith('docs/case-studies/issue-56/data/')))
names = [str(p.relative_to(root)) for p in sorted((root / 'ci-logs').glob('follow-telegram-*.log'))]
names += ['ci-logs/follow-telegram-latest-runs.json',
          'experiments/issue-56/follow-telegram-regression.py',
          'experiments/issue-56/collect-follow-telegram-evidence.py']
metadata = {
    'preceding_ci_head': 'b6e497e69e9c577ad49020bd10ec04903f7b8efa',
    'preceding_ci': 'All five workflows passed; current commit CI remains required.',
    'checks': {'focused_tests': 64, 'chromium': 'passed', 'mcp': 'passed',
               'before_probes': 'Both fail as expected; corrected sources restored.'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest() for n in sources},
    'limits': 'Offline fixtures only; no live account writes or full local matrices. FL03 shared leave corrections, FL04 and FL06–FL09 remain unfinished.',
}
archive = root / 'docs/case-studies/issue-56/data/follow-telegram.tar.gz'
payload = (json.dumps(metadata, indent=2) + '\n').encode()
with tarfile.open(archive, 'w:gz') as tar:
    for name in names:
        tar.add(root / name, arcname=name)
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
