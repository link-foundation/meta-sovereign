"""Preserve bounded answer-learning concurrent-edit regressions."""
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
               (root / 'ci-logs').glob('question-concurrency-*.log')
               if p.name != 'question-concurrency-archive.log')
names += ['ci-logs/question-concurrency-current-runs.json',
          'ci-logs/question-concurrency-recent-runs.json',
          'ci-logs/question-concurrency-issue56.json',
          'experiments/issue-56/collect-question-concurrency.py']
metadata = {
    'preceding_head': '4e6954ff08f5c98ff2b26abba4c5e42ed0687893',
    'checks': {'before_core': 7, 'before_cli': 1, 'node': 38, 'deno': 9,
               'chromium': 'pass'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest()
                for n in sources},
    'limits': 'One shared store instance; raw writes retain storage guarantees. Exact new-head CI and all other unchecked issue scope remain unfinished.',
}
archive = root / 'docs/case-studies/issue-56/data/question-concurrency.tar.gz'
write_hashed_archive(root, archive, names, metadata, len(sources))
