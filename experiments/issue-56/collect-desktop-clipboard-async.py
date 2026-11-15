"""Retain the hosted failure, pinned API and finite asynchronous regression."""
import subprocess
from pathlib import Path
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'acknowledgedBeforeCompletion":true' in (logs / 'desktop-clipboard-async-before.log').read_text()
assert 'acknowledgedBeforeCompletion":false' in (logs / 'desktop-clipboard-async-after-probe.log').read_text()
assert 'pass 8' in (logs / 'desktop-clipboard-async-focused.log').read_text()
assert 'TypeError' in (logs / 'desktop-clipboard-native-failure.log').read_text()
names = [
    'js/electron/clipboard.js', 'js/tests/desktop-clipboard.test.js',
    'experiments/issue-56/desktop-clipboard-async.mjs',
    'experiments/issue-56/desktop-clipboard-electron.mjs',
    'experiments/issue-56/collect-desktop-clipboard-async.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/desktop-clipboard-async.md',
    'ci-logs/desktop-clipboard-native-failure.log',
    'ci-logs/desktop-clipboard-electron-api.source',
    'ci-logs/desktop-clipboard-async-before.log',
    'ci-logs/desktop-clipboard-async-after-probe.log',
    'ci-logs/desktop-clipboard-async-focused.log',
    'ci-logs/desktop-clipboard-async-lint.log',
]
assert not (logs / 'desktop-clipboard-async-lint.log').read_text().strip()
entries = {name: (root / name).read_bytes() for name in names}
for name in ['js/electron/clipboard.js', 'experiments/issue-56/desktop-clipboard-electron.mjs']:
    entries[f'before/{name}'] = subprocess.check_output(['git', 'show', f'c0b31a6c:{name}'], cwd=root)
entries['metadata.json'] = b'{"issue_complete":false,"native_ci_pending":true,"electron_version":"45.3.2"}\n'
write_entries_archive(root / 'docs/case-studies/issue-56/data/desktop-clipboard-async.tar.gz', entries)
