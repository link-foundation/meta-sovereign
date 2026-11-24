"""Archive bounded backlink regressions and the preceding exact-head CI logs."""
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
names = sorted(str(p.relative_to(root)) for p in
               (root / 'ci-logs').glob('follow-backlinks-*.log'))
names += [
    'ci-logs/follow-backlinks-current-runs.json',
    'ci-logs/checks-42764827897.log',
    'ci-logs/legacy-follow-mobile-investigation.log',
    'ci-logs/legacy-follow-mobile-after.log',
    'experiments/issue-56/legacy-follow-mobile.mjs',
    'experiments/issue-56/follow-backlinks-ui.mjs',
    'experiments/issue-56/collect-follow-backlink-evidence.py',
]
names += sorted(str(p.relative_to(root)) for p in
                (root / 'ci-logs').glob('superseded-427647*.log'))
metadata = {
    'preceding_head': '4b3dc3e2c32170694c24590cdbca231550e2cb48',
    'checks': {'focused': 25, 'compatibility': 50, 'chromium': 'passed',
               'mcp': 'before, paused recovery defect, exact review, confirmed recovery and mobile',
               'baseline': 'Normalized cache and paused resume regressions fail before correction.'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest() for n in sources},
    'limits': 'External VK HTTP mocked; no live writes. New exact-head CI remains required. FL07/FL09 and broader FL08 plus every other unchecked issue-wide criterion remain unfinished.',
}
archive = root / 'docs/case-studies/issue-56/data/follow-backlinks.tar.gz'
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
print(f'Verified {len(hashes)} archive entries and {len(sources)} source hashes')
