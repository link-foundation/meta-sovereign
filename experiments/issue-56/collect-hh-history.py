"""Archive finite HH history regressions, browser evidence and source hashes."""
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
sources = sorted(set(name for name in changed if name and
                     not name.startswith('docs/case-studies/issue-56/data/')))
names = sorted(str(path.relative_to(root)) for path in
               (root / 'ci-logs').glob('hh-history-*')
               if path.is_file() and path.suffix in ['.log', '.json'] and
               not path.name.endswith(('-archive.log', '-commit.log', '-push.log', '-pr.log')))
names += ['ci-logs/question-concurrency-issue56.json',
          'experiments/issue-56/collect-hh-history.py']
assert 'fail 3' in (root / 'ci-logs/hh-history-before.log').read_text()
assert 'retains the real applicant answer proposal' in (root / 'ci-logs/hh-history-browser-before.log').read_text()
assert 'pass 36' in (root / 'ci-logs/hh-history-after.log').read_text()
assert '13 passed | 0 failed' in (root / 'ci-logs/hh-history-deno.log').read_text()
assert '[e2e-hh-history] OK (chromium)' in (root / 'ci-logs/hh-history-browser-after.log').read_text()
assert '[e2e-questions] OK (chromium)' in (root / 'ci-logs/hh-history-browser-integrated.log').read_text()
assert not (root / 'ci-logs/hh-history-lint.log').read_text()
metadata = {
    'preceding_head': '6c0150330a189cf83adf6c9038dbf35b050ef715',
    'primary_reference': 'https://api.hh.ru/openapi/en/redoc',
    'reference_checked': '2026-11-10',
    'checks': {'before_core': '3 failures', 'before_browser': 'missing proposal',
               'node': 36, 'deno': 13, 'chromium': 'focused and integrated questions pass',
               'mcp': 'read-only preview, missing-ID HTTP refusal, explicit unapproved save, 390px'},
    'sources': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                for name in sources},
    'limits': 'HH normalization only; complete provider history retrieval and broader issue criteria remain unfinished. Preceding Pages run cancelled during Ubuntu package downloads; exact new-head CI remains required.',
}
archive = root / 'docs/case-studies/issue-56/data/hh-history-learning.tar.gz'
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
