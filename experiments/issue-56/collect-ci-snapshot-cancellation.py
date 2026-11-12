"""Preserve bounded snapshot cancellation investigation."""
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
               (root / 'ci-logs').glob('ci-handoff-*.log')
               if p.name not in ['ci-handoff-archive.log'] and
               not p.name.startswith(('ci-handoff-job-', 'ci-handoff-chromium-')))
names += sorted(str(p.relative_to(root)) for p in
                (root / 'ci-logs').glob('ci-handoff-*.json'))
names += ['experiments/issue-56/collect-ci-snapshot-cancellation.py']
metadata = {
    'preceding_head': '2aced5d36dfd5004859417b8535cff121425cacc',
    'checks': {'before': '1 fail, 1 pass', 'node': 17, 'deno': 8,
               'descriptor_probe': 'No descriptor leak reproduced on local Linux runtimes'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest()
                for n in sources},
    'limits': 'Cooperative cancellation ownership verified. The exact Windows locked file remains unidentified; new-head CI and all other unchecked issue scope remain unfinished.',
}
archive = root / 'docs/case-studies/issue-56/data/ci-snapshot-cancellation.tar.gz'
write_hashed_archive(root, archive, names, metadata, len(sources))
