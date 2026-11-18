"""Preserve bounded automatic Follow evidence and preceding-head CI context."""
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
               (root / 'ci-logs').glob('auto-follow-*.log'))
names += [
    'ci-logs/auto-follow-baseline-runs.json',
    'experiments/issue-56/auto-follow-ui.mjs',
    'experiments/issue-56/collect-auto-follow-evidence.py',
]
names += sorted(str(p.relative_to(root)) for p in
                (root / 'experiments/issue-56/vk-follow-schema').glob('*')
                if p.is_file())
metadata = {
    'preceding_head': '75a5e1302ac49e45f7b672ffb71a724c9306c2ff',
    'checks': {
        'focused': 80,
        'compatibility': 50,
        'chromium': 'Automatic Follow and existing Telegram backlink production checks passed',
        'mcp': 'Read-only review; confirmed second round with prior receipt; saved reload; VK membership-only review; mobile result',
        'baseline': 'Draft UI incorrectly rendered incomplete warnings for confirmed skipped phases; regression now passes.',
    },
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest() for n in sources},
    'limits': 'External provider RPCs are mocked; no live account writes. Exact new-head CI remains required. Broader FL08 and all other unchecked issue-wide criteria remain unfinished.',
}
archive = root / 'docs/case-studies/issue-56/data/auto-follow.tar.gz'
write_hashed_archive(root, archive, names, metadata, len(sources))
