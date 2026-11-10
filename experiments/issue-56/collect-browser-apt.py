"""Preserve repeated hosted package-download timeouts and focused evidence."""
from pathlib import Path
import gzip
import hashlib
import io
import json
import subprocess
import tarfile

root = Path(__file__).resolve().parents[2]
names = sorted(str(path.relative_to(root)) for path in
               (root / 'ci-logs').glob('browser-apt-*')
               if path.is_file() and path.suffix in ['.log', '.json'] and
               not path.name.endswith(('-archive.log', '-commit.log', '-push.log', '-pr.log')))
names += ['ci-logs/hh-history-pages-42812224902.log',
          'ci-logs/hh-history-pages-jobs.json',
          'ci-logs/shared-profile-pages-42804967429.log',
          'experiments/issue-56/collect-browser-apt.py']
assert 'prepare before apt' in (root / 'ci-logs/browser-apt-before.log').read_text()
assert 'pass 23' in (root / 'ci-logs/browser-apt-after.log').read_text()
assert not (root / 'ci-logs/browser-apt-lint.log').read_text()
changed = subprocess.check_output(
    ['git', 'ls-files', '--modified', '--others', '--exclude-standard', '-z'],
    cwd=root).decode().split('\0')
sources = sorted(set(name for name in changed if name and
                     not name.startswith('docs/case-studies/issue-56/data/')))
metadata = {
    'preceding_head': '364463ec039dbcc20d1f30fe6da1fbbd050f06e6',
    'references': ['https://ubuntu.com/project/docs/how-ubuntu-is-made/concepts/package-archive/',
                   'https://playwright.dev/docs/ci'],
    'checked': '2026-11-10',
    'sources': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                for name in sources},
    'checks': {'before': 'workflow regression fails', 'focused': 23,
               'lint': 'pass', 'workflow_policy': 'pass'},
    'limits': 'Synthetic local APT fixtures only. Exact new-head hosted downloads and browser assertions remain required; no timeout increase or passing-CI claim.',
}
archive = root / 'docs/case-studies/issue-56/data/browser-apt.tar.gz'
with archive.open('wb') as raw:
    with gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w') as tar:
            entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
            entries['metadata.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
            for name, data in entries.items():
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                tar.addfile(entry, io.BytesIO(data))
with tarfile.open(archive, 'r:gz') as tar:
    hashes = {entry.name: hashlib.sha256(tar.extractfile(entry).read()).hexdigest()
              for entry in tar.getmembers() if entry.isfile()}
assert hashes == {name: hashlib.sha256(data).hexdigest() for name, data in entries.items()}
archive.with_suffix('').with_suffix('.tar.sha256.json').write_text(
    json.dumps({'archive': archive.name, 'files': hashes}, indent=2) + '\n')
print(f'Verified {len(hashes)} archive entries and {len(sources)} source hashes')
