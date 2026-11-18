"""Preserve the exact-head synthetic credential finding and focused correction."""
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
assert '[BasicAuth]' in (root / 'ci-logs/assignment-secretlint-before.log').read_text()
assert 'pass 19' in (root / 'ci-logs/assignment-secretlint-node.log').read_text()
assert '19 passed | 0 failed' in (root / 'ci-logs/assignment-secretlint-deno.log').read_text()
for name in ['after', 'eslint']:
    assert not (root / f'ci-logs/assignment-secretlint-{name}.log').read_text().strip()
sources = [
    'js/tests/forms-assignment.test.js',
    'docs/case-studies/issue-56/ci-assignment-secret-fixture.md',
    'experiments/issue-56/collect-ci-assignment-secret.py',
    'ci-logs/forms-assignment-head-runs.json',
    'ci-logs/checks-42960668703-jobs.json',
    'ci-logs/checks-42960668703-full.log',
    'ci-logs/checks-42960668703-job-130326310576.log',
    'ci-logs/checks-42956946192-full.log',
    'ci-logs/assignment-parent-checks-latest.json',
    *[f'ci-logs/assignment-secretlint-{name}.log' for name in [
        'before', 'after', 'node', 'deno', 'eslint', 'format']],
]
bundle(root, sources,
       'docs/case-studies/issue-56/data/ci-assignment-secret-fixture.tar.gz',
       {'preceding_head': 'b7a95bda4c4bf44bf33ff19c2cc0807e547b2206',
        'node': 19, 'deno': 19, 'scanner_configuration_changed': False,
        'remaining': 'Exact new-head CI and every unchecked issue criterion.'},
       'no-ci-assignment-secret-images-*.png',
       before={'js/tests/forms-assignment.test.js':
               'b7a95bda4c4bf44bf33ff19c2cc0807e547b2206'})
