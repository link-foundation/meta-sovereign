"""Preserve finite HH common-chat regressions and verify every archived byte."""
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
               (root / 'ci-logs').glob('hh-common-*')
               if path.is_file() and path.suffix in ['.log', '.json'] and
               not path.name.endswith(('-archive.log', '-commit.log', '-push.log', '-pr.log')))
names += ['ci-logs/question-concurrency-issue56.json',
          'ci-logs/hh-live-common-chats.log',
          'ci-logs/hh-live-chat-schemas.json',
          'ci-logs/hh-live-chat-examples.json',
          'ci-logs/hh-live-message-fields.log',
          'ci-logs/hh-live-write-schemas.json',
          'experiments/issue-56/collect-hh-common.py']
assert 'GET /negotiations' in (root / 'ci-logs/hh-common-before.log').read_text()
assert 'fail 1' in (root / 'ci-logs/hh-common-bubble-before.log').read_text()
assert 'pass 61' in (root / 'ci-logs/hh-common-final.log').read_text()
assert '12 passed | 0 failed' in (root / 'ci-logs/hh-common-deno.log').read_text()
assert '[e2e-hh-common] OK (chromium)' in (root / 'ci-logs/hh-common-browser-after.log').read_text()
assert '[e2e-inbox-pull] OK (chromium)' in (root / 'ci-logs/hh-common-browser-integrated.log').read_text()
assert not (root / 'ci-logs/hh-common-lint.log').read_text()
metadata = {
    'preceding_head': 'e280197a099f41b2874025c6a49360ebf2ea770c',
    'primary_reference': 'https://api.hh.ru/openapi/specification/public/en',
    'reference_checked': '2026-11-10',
    'full_specification_sha256': hashlib.sha256(
        (root / 'ci-logs/hh-live-openapi.yaml').read_bytes()).hexdigest(),
    'checks': {'before': 'wrong default endpoint, absent fetch, incoming outgoing bubble',
               'node_final': 61, 'deno': 12,
               'chromium': 'focused and integrated inbox-pull pass',
               'mcp': 'partial/complete counts, real direction, 390px, closed fixture'},
    'sources': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                for name in sources},
    'limits': 'Synthetic current API fixtures; no real account. Browser history, unread watching, complete provider histories and broader issue criteria remain unfinished. New-head CI remains required.',
}
archive = root / 'docs/case-studies/issue-56/data/hh-common-history.tar.gz'
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
