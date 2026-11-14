"""Preserve bounded named-profile verification and preceding-head CI evidence."""
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
               (root / 'ci-logs').glob('shared-profile-*')
               if p.is_file() and p.suffix in ['.log', '.json'] and
               not p.name.endswith(('-archive.log', '-commit.log', '-push.log', '-pr.log')))
names += ['ci-logs/question-concurrency-issue56.json',
          'experiments/issue-56/collect-question-shared-profile.py']
assert '[e2e-shared-profile] OK (chromium)' in (root / 'ci-logs/shared-profile-browser.log').read_text()
assert 'pass 81' in (root / 'ci-logs/shared-profile-after.log').read_text()
assert '9 passed | 0 failed' in (root / 'ci-logs/shared-profile-deno.log').read_text()
assert not (root / 'ci-logs/shared-profile-lint.log').read_text()
metadata = {
    'preceding_head': '48a13ae1815f0fbf45bc90d65a2f11c84f38bb75',
    'checks': {'before_named_value': 1, 'node': 81, 'deno': 9,
               'chromium': 'pass', 'mcp': 'staged edits, refusal, retry, mobile'},
    'sources': {n: hashlib.sha256((root / n).read_bytes()).hexdigest()
                for n in sources},
    'limits': 'Named profiles with current-value references and local overrides. Legacy contact import, broader issue scope and exact new-head CI remain unfinished. Preceding-head Chromium overlap warning is under investigation; Pages was cancelled.',
}
archive = root / 'docs/case-studies/issue-56/data/question-shared-profile.tar.gz'
write_hashed_archive(root, archive, names, metadata, len(sources))
