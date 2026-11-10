"""Preserve bounded owner correction reproduction and verification."""
from pathlib import Path
import gzip
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
               (root / 'ci-logs').glob('question-corrections-*.log')
               if p.name != 'question-corrections-archive.log')
names += sorted(str(p.relative_to(root)) for p in
                (root / 'ci-logs').glob('question-corrections-*.json'))
names += ['ci-logs/question-cleanup-reference-learning.json',
          'ci-logs/question-cleanup-reference-learning.mjs']
names += ['experiments/issue-56/collect-question-corrections.py']
metadata = {
    'preceding_head': 'dfa1f68d8b0888ba4468fd6e3fc354bcff216bf6',
    'checks': {'before': '5 fail, 1 pass; private-path case also fails before its fix', 'focused': 47,
               'chromium': 'production questions flow passes'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest()
                for n in sources},
    'limits': 'Explicit owner-policy correction and private-path controls verified. General fact extraction, concurrent knowledge edits, live imports, Windows/Deno EBUSY and other unchecked issue scope remain unfinished.',
}
archive = root / 'docs/case-studies/issue-56/data/question-corrections.tar.gz'
with archive.open('wb') as raw:
    with gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as tar:
            for name in sorted(set(names)):
                data = (root / name).read_bytes()
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                tar.addfile(entry, io.BytesIO(data))
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
