"""Preserve bounded export destination race investigation."""
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
               (root / 'ci-logs').glob('ci-export-defaults-*.log')
               if p.name != 'ci-export-defaults-archive.log')
names += ['ci-logs/ci-export-defaults-current-runs.json',
          'experiments/issue-56/collect-ci-export-defaults.py']
metadata = {
    'preceding_head': '8c3654f21c033f27a16e7823e70f936d9fd778d8',
    'checks': {'before': 'held-response assertion fails', 'node': 32,
               'chromium': 'pass', 'mcp': 'exact destination and file verified'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest()
                for n in sources},
    'limits': 'Delayed export defaults regression verified. New-head CI and all other unchecked issue scope remain unfinished.',
}
archive = root / 'docs/case-studies/issue-56/data/ci-export-defaults.tar.gz'
write_hashed_archive(root, archive, names, metadata, len(sources))
