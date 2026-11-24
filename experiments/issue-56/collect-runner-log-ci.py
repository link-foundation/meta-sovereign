"""Preserve the actual hosted failures and finite diagnostic/checkout checks."""
import subprocess
from pathlib import Path
from evidence_bundle import evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
for name, fragment in (
    ('before', 'AssertionError'), ('cause', 'delivery rejection is unchanged'),
    ('followup-node', 'pass 6'), ('bun', '2 pass'),
    ('deno', '2 passed | 0 failed'),
    ('format-final', 'All matched files use Prettier code style!'),
):
    assert fragment in (logs / f'runner-log-ci-{name}.log').read_text(), name
for name in ('lint', 'diff'):
    assert not (logs / f'runner-log-ci-{name}.log').read_text().strip(), name
sources = [
    '.github/workflows/release.yml', 'js/src/automation/trigger-log.js',
    'js/tests/vk-friends.test.js', 'js/tests/vk-live-history.test.js',
    'js/tests/ci-filtered-checkout.test.js', 'js/tests/ci-cache-policy.test.js',
    'experiments/issue-56/trigger-log-cause.mjs',
    'experiments/issue-56/collect-runner-log-ci.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/runner-log-ci.md',
]
sources += evidence_logs(root, 'runner-log-ci')
sources += [str(p.relative_to(root)) for p in logs.glob('vk-token-parent-*.log')]
entries = {name: (root / name).read_bytes() for name in sorted(set(sources))}
for name in sources[:6]:
    entries[f'before/{name}'] = subprocess.check_output(
        ['git', 'show', f'b18c9d0a:{name}'], cwd=root)
entries['metadata.json'] = b'{"issue_complete": false, "hosted_verification_pending": true, "unchecked_required_rows": 60}\n'
write_entries_archive(root / 'docs/case-studies/issue-56/data/runner-log-ci.tar.gz', entries)
