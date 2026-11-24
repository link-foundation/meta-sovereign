"""Preserve exact-head runtime failures and focused fixture compatibility checks."""
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
assert 'pass 14' in (root / 'ci-logs/assignment-plan-fixtures-node.log').read_text()
assert '14 passed | 0 failed' in (root / 'ci-logs/assignment-plan-fixtures-deno.log').read_text()
assert not (root / 'ci-logs/assignment-plan-fixtures-eslint.log').read_text().strip()
sources = [
    'js/tests/forms-answer-plan.test.js',
    'docs/case-studies/issue-56/ci-assignment-plan-fixtures.md',
    'experiments/issue-56/collect-ci-assignment-plan.py',
    'ci-logs/assignment-publisher-head-runs.json',
    'ci-logs/assignment-publisher-parent-checks-jobs.json',
    *[str(path.relative_to(root)) for path in sorted(
        (root / 'ci-logs').glob('checks-42961487507-job-*.log'))],
    *[f'ci-logs/assignment-plan-fixtures-{name}.log' for name in [
        'node', 'deno', 'eslint', 'format']],
]
bundle(root, sources,
       'docs/case-studies/issue-56/data/ci-assignment-plan-fixtures.tar.gz',
       {'preceding_head': '2113cda0794125ac5a1b0425f7e641e1a08af1f9',
        'node': 14, 'deno': 14, 'production_changes': False,
        'remaining': 'Exact new-head CI and every unchecked issue criterion.'},
       'no-ci-assignment-plan-images-*.png',
       before={'js/tests/forms-answer-plan.test.js':
               '2113cda0794125ac5a1b0425f7e641e1a08af1f9'})
