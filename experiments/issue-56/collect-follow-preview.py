"""Preserve pending Follow preview cancellation reproduction and verification."""
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
               (root / 'ci-logs').glob('follow-preview-*.log'))
names += sorted(str(p.relative_to(root)) for p in
                (root / 'ci-logs').glob('follow-preview-*.json'))
names += ['experiments/issue-56/collect-follow-preview.py']
metadata = {
    'preceding_head': 'c80df8b0e6c36b875879e255471ce2b2403a3af2',
    'checks': {'before': '5 fail; production browser Stop missing', 'focused_core': 103,
               'policy_retry': 13, 'chromium': 'VK, Telegram and automatic Follow production flows pass'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest()
                for n in sources},
    'limits': 'No live provider actions. Inventoried FL01-FL09 behavior verified; other unchecked issue criteria remain unfinished. Exact new-head CI remains required.',
}
archive = root / 'docs/case-studies/issue-56/data/follow-preview.tar.gz'
write_hashed_archive(root, archive, names, metadata, len(sources))
