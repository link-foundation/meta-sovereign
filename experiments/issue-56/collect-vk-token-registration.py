"""Retain the actual hosted failure and finite registration regression."""
import subprocess
from pathlib import Path
from evidence_bundle import write_entries_archive

root = Path(__file__).resolve().parents[2]
assert 'fail 1' in (root / 'ci-logs/vk-token-registration-before.log').read_text()
assert 'pass 5' in (root / 'ci-logs/vk-token-registration-after.log').read_text()
files = [
    'package.json', 'js/scripts/browser-checks.json',
    'js/tests/e2e-vk-token-browser.mjs', 'js/tests/ci-browser-shards.test.js',
    'docs/case-studies/issue-56/vk-token-registration.md',
    'experiments/issue-56/collect-vk-token-registration.py',
    'experiments/issue-56/evidence_bundle.py',
    'ci-logs/vk-token-workflow-failure.log',
    'ci-logs/vk-token-registration-before.log',
    'ci-logs/vk-token-registration-after.log',
]
entries = {name: (root / name).read_bytes() for name in files}
entries['before/package.json'] = subprocess.check_output(
    ['git', 'show', 'c4b904c3:package.json'], cwd=root)
entries['metadata.json'] = b'{"issue_complete": false, "hosted_verification_pending": true}\n'
write_entries_archive(root / 'docs/case-studies/issue-56/data/vk-token-registration.tar.gz', entries)
