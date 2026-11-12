"""Preserve focused Follow read policy reproduction and verification."""
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
write_hashed_archive(root, archive, names, metadata, len(sources))
