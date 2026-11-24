"""Archive the finite filtered-checkout regression and its exact CI evidence."""
import subprocess
from pathlib import Path
from evidence_bundle import evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
for name, fragment in (
    ('before', 'fail 1'), ('node', 'pass 4'),
    ('bun', '2 pass'), ('deno', '2 passed | 0 failed'),
    ('format-final', 'All matched files use Prettier code style!'),
):
    assert fragment in (logs / f'checkout-filter-{name}.log').read_text(), name
for name in ('lint', 'diff'):
    assert not (logs / f'checkout-filter-{name}.log').read_text().strip(), name
names = [
    '.github/workflows/release.yml', 'js/tests/ci-filtered-checkout.test.js',
    'docs/case-studies/issue-56/ci-checkout-plan.md',
    'docs/case-studies/issue-56/ci-checkout.md',
    'experiments/issue-56/collect-ci-checkout.py',
    'experiments/issue-56/evidence_bundle.py',
    'ci-logs/runner-log-current-macos-api.log',
    'ci-logs/runner-log-checkout-action.yml',
]
names += evidence_logs(root, 'checkout-filter')
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
parent = '7ef15a6f'
entries['before/.github/workflows/release.yml'] = subprocess.check_output(
    ['git', 'show', f'{parent}:.github/workflows/release.yml'], cwd=root)
entries['metadata.json'] = b'{"issue_complete": false, "hosted_verification_pending": true, "unchecked_required_rows": 60}\n'
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-checkout.tar.gz', entries)
