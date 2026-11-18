"""Archive the pinned loader and finite before/current readiness evidence."""
import subprocess
from pathlib import Path
from evidence_bundle import evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert '"evaluated":false' in (logs / 'vk-token-electron-entry-before.log').read_text()
assert '"evaluated":true' in (logs / 'vk-token-electron-entry-after.log').read_text()
assert 'deadline reached' in (logs / 'vk-token-electron-entry-deadline.log').read_text()
assert 'pass 9' in (logs / 'vk-token-electron-entry-node.log').read_text()
files = [
    'experiments/issue-56/vk-token-electron.mjs',
    'experiments/issue-56/vk-token-electron-entry.mjs',
    'experiments/issue-56/collect-vk-token-electron-entry.py',
    'experiments/issue-56/evidence_bundle.py',
    'js/tests/vk-token-electron-entry.test.js',
    'docs/case-studies/issue-56/vk-token-electron-entry.md',
    'docs/case-studies/issue-56/vk-token-plan.md',
    'docs/case-studies/issue-56/vk-token.md',
    'ci-logs/vk-token-electron-init.source',
    'ci-logs/vk-token-desktop-jobs.json',
] + evidence_logs(root, 'vk-token-electron-entry')
entries = {name: (root / name).read_bytes() for name in sorted(set(files))}
entries['before/experiments/issue-56/vk-token-electron.mjs'] = subprocess.check_output(
    ['git', 'show', 'c4b904c3:experiments/issue-56/vk-token-electron.mjs'], cwd=root)
entries['metadata.json'] = b'{"issue_complete": false, "native_electron_verification_pending": true, "live_provider": false}\n'
write_entries_archive(root / 'docs/case-studies/issue-56/data/vk-token-electron-entry.tar.gz', entries)
