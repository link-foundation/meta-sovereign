"""Archive the actual syntax recommendation and scoped audit correction."""
import subprocess
from pathlib import Path
from evidence_bundle import evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'help[self-repository]' in (logs / 'cache-audit-before.log').read_text()
assert 'No findings to report' in (logs / 'cache-audit-after.log').read_text()
assert 'pass 3' in (logs / 'cache-audit-node.log').read_text()
sources = [
    '.github/workflows/release.yml', 'js/tests/ci-cache-policy.test.js',
    'experiments/issue-56/cache-action-audit.py',
    'experiments/issue-56/collect-cache-action-audit.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/cache-action-audit.md',
    'ci-logs/vk-token-ea0-audit.log', 'ci-logs/vk-token-ea0-jobs.json',
] + evidence_logs(root, 'cache-audit')
entries = {name: (root / name).read_bytes() for name in sorted(set(sources))}
entries['before/.github/workflows/release.yml'] = subprocess.check_output(
    ['git', 'show', 'ea0c506e:.github/workflows/release.yml'], cwd=root)
entries['metadata.json'] = b'{"issue_complete": false, "hosted_verification_pending": true, "unchecked_required_rows": 60}\n'
write_entries_archive(root / 'docs/case-studies/issue-56/data/cache-action-audit.tar.gz', entries)
