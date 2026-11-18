"""Preserve focused Telegram backlink evidence and exact-head CI context."""
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
               (root / 'ci-logs').glob('telegram-backlinks-*.log'))
names += [
    'ci-logs/telegram-backlinks-lint-fix-runs.json',
    'ci-logs/checks-42770414315.log',
    'ci-logs/telegram-backlink-inspection-before.log',
    'experiments/issue-56/telegram-backlinks-ui.mjs',
    'experiments/issue-56/telegram-backlink-draft.mjs',
    'experiments/issue-56/collect-telegram-backlink-evidence.py',
]
metadata = {
    'preceding_head': 'aec48950c1005c43c9217c329d7bcad23cd1fe3c',
    'checks': {'focused': 50, 'compatibility': 51,
               'chromium': 'Telegram and existing VK production checks passed',
               'mcp': 'VK-only before; exact review; local cleanup; capability refusal; confirmed mobile post',
               'baseline': 'Service-message inspection counted survival before exact outgoing-message validation.'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest() for n in sources},
    'limits': 'Only external provider RPCs are mocked; no live account writes. Exact new-head CI remains required. FL07, full FL09, broader FL08 and all other unchecked issue-wide criteria remain unfinished.',
}
archive = root / 'docs/case-studies/issue-56/data/telegram-backlinks.tar.gz'
write_hashed_archive(root, archive, names, metadata, len(sources))
