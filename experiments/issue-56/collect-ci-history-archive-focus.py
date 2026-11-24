"""Retain exact hosted admission failure and bounded launch correction evidence."""
from pathlib import Path
import json
import subprocess
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'fail 1' in (logs / 'ci-history-focus-before.log').read_text()
node = (logs / 'ci-history-focus-node.log').read_text()
assert 'pass 26' in node and 'fail 0' in node
assert json.loads((logs / 'ci-history-focus-native.log').read_text())['cases'] == 3
for suffix in ['lint', 'secrets', 'diff']:
    assert not (logs / f'ci-history-focus-{suffix}.log').read_text().strip()
names = [
    'js/tests/e2e-question-history-browser.mjs',
    'js/tests/ci-native-focus.test.js',
    'js/tests/helpers/e2e-browser-scenarios.mjs',
    'js/tests/helpers/e2e-browser-history-archive.mjs',
    'experiments/issue-56/collect-ci-history-archive-focus.py',
    'docs/case-studies/issue-56/ci-history-archive-focus.md',
    'ci-logs/ci-bea-runs.json',
    'ci-logs/checks-43793268260-chromium1.log',
    *[str(p.relative_to(root)) for p in logs.glob('ci-history-focus-*.log')],
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
for name in names[:2]:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'bea3183e:{name}'], cwd=root)
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-history-archive-focus.tar.gz', entries)
