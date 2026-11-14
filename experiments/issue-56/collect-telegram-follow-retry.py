"""Preserve focused Telegram Follow retry reproduction and verification."""
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
               (root / 'ci-logs').glob('telegram-follow-retry-*.log'))
names += [
    'ci-logs/telegram-follow-retry-runs.json',
    'ci-logs/telegram-follow-retry-prior-checks.json',
    'ci-logs/telegram-follow-retry-prior-jobs.json',
    'ci-logs/checks-42779144776.log',
    'ci-logs/links-42780345216.log',
    'ci-logs/links-42780345216-attempt2.log',
    'experiments/issue-56/collect-telegram-follow-retry.py',
]
metadata = {
    'preceding_head': 'f82bba0c67530cabf0b9dfad219a24587b131084',
    'checks': {'before': '4 failures', 'focused': 66, 'compatibility': 6,
               'chromium': 'Standalone Telegram and automatic Follow pass'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest()
                for n in sources},
    'limits': 'Provider RPC fixtures only. Broader FL08 and every other unchecked issue criterion remain unfinished. Exact new-head CI remains required.',
}
archive = root / 'docs/case-studies/issue-56/data/telegram-follow-retry.tar.gz'
write_hashed_archive(root, archive, names, metadata, len(sources))
