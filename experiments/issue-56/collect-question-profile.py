"""Preserve bounded contact/CV profile extraction evidence."""
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
               (root / 'ci-logs').glob('question-profile-*')
               if p.is_file() and p.suffix in ['.log', '.json'] and
               not p.name.endswith(('-archive.log', '-commit.log', '-push.log', '-pr.log')))
names += ['ci-logs/question-concurrency-issue56.json',
          'experiments/issue-56/collect-question-profile.py']
assert '[e2e-questions] OK (chromium)' in (root / 'ci-logs/question-profile-browser.log').read_text()
assert 'pass 52' in (root / 'ci-logs/question-profile-after.log').read_text()
assert '7 passed | 0 failed' in (root / 'ci-logs/question-profile-deno.log').read_text()
assert not (root / 'ci-logs/question-profile-lint.log').read_text()
metadata = {
    'preceding_head': 'ed241ef58612348e7cae062da98b27989506c467',
    'checks': {'before_cli': 1, 'before_browser_bridge': 1, 'node': 52, 'deno': 7,
               'chromium': 'pass', 'mcp': 'selected-only, refusal, late edit, editors, mobile'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest()
                for n in sources},
    'limits': 'Owner-supplied contact text and one explicitly selected stored CV only. Central reusable profiles, legacy contact import, all other unchecked scope and exact new-head CI remain unfinished.',
}
archive = root / 'docs/case-studies/issue-56/data/question-profile.tar.gz'
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
