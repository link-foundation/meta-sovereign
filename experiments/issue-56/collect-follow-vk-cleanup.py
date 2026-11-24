"""Preserve focused VK Follow cleanup reproduction and verification."""
from pathlib import Path
import hashlib
import json
import subprocess
from evidence_bundle import write_hashed_archive

root = Path(__file__).resolve().parents[2]
changed = subprocess.check_output(
    ['git', 'ls-files', '--modified', '--others', '--exclude-standard', '-z'],
    cwd=root).decode().split('\0')
sources = sorted(set(n for n in changed if n and
                     not n.startswith('docs/case-studies/issue-56/data/')))
names = sorted(str(p.relative_to(root)) for p in
               (root / 'ci-logs').glob('follow-vk-cleanup-*.log'))
names += sorted(str(p.relative_to(root)) for p in
                (root / 'ci-logs').glob('follow-vk-cleanup-*.json'))
names += ['experiments/issue-56/collect-follow-vk-cleanup.py']
metadata = {
    'preceding_head': 'a72a0551eae7bfab96726ca2bfb43fd0b2c84bdc',
    'checks': {'before': '5 fail, 1 pass', 'focused_core': 66,
               'controls_retry': 13, 'chromium': 'VK backlink production flow passes'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest()
                for n in sources},
    'limits': 'No live provider actions. FL08 pending-preview cancellation and every other unchecked issue criterion remain unfinished. Exact new-head CI remains required.',
}
archive = root / 'docs/case-studies/issue-56/data/follow-vk-cleanup.tar.gz'
write_hashed_archive(root, archive, names, metadata, len(sources))
