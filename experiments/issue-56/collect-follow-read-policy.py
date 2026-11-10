"""Preserve focused Follow read policy reproduction and verification."""
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
               (root / 'ci-logs').glob('follow-read-*.log'))
names += sorted(str(p.relative_to(root)) for p in
                (root / 'ci-logs').glob('follow-read-policy-*.json'))
names += ['experiments/issue-56/collect-follow-read-policy.py']
metadata = {
    'preceding_head': '70a5f489d309fb340dfc4944f0c55e6ba1d6f4af',
    'checks': {'before': '4 failures and 1 bounded cancellation',
               'provider_compatibility_group': 100, 'http_recovery_group': 15,
               'chromium': 'Standalone Telegram, VK discovery and automatic Follow pass',
               'baseline_ci': 'All 5 preceding-head workflows pass'},
    'mcp': {'fixture': 'experiments/issue-56/follow-retry-ui.mjs',
            'desktop': {'width': 1920, 'height': 1080, 'fields': 3,
                        'defaults': [3, 100, 2000], 'telegram_groups': 1,
                        'vk_groups': 3, 'alerts': 0},
            'mobile': {'width': 390, 'height': 844, 'scrollWidth': 390, 'fields': 3},
            'console': 'Existing favicon.ico 404 only',
            'cleanup': 'Browser closed, isolated fixture exited 0'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest()
                for n in sources},
    'limits': 'Provider fixtures only. Broader FL08 cleanup/lifecycle audit and every other unchecked issue criterion remain unfinished. Exact new-head CI remains required.',
}
archive = root / 'docs/case-studies/issue-56/data/follow-read-policy.tar.gz'
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
