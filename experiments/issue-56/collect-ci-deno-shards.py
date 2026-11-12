"""Preserve the hosted Windows deadline and finite native shard regression."""
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'pass 23' in (logs / 'deno-shards-node.log').read_text()
assert '23 passed | 0 failed' in (logs / 'deno-shards-deno.log').read_text()
assert 'fail 1' in (logs / 'deno-shards-before.log').read_text()
bundle(root, [
    '.github/workflows/release.yml', 'js/tests/ci-deno-shards.test.js',
    'js/tests/ci-node-shards.test.js', 'js/tests/ci-contracts.test.js',
    'docs/case-studies/issue-56/ci-deno-shards.md',
    'experiments/issue-56/collect-ci-deno-shards.py',
    *[f'ci-logs/resume-{name}' for name in [
        'current-runs.json', 'published-checks.json', 'published-checks.log',
        'parent-windows-deno.log', 'deno-job.json', 'deno-annotations.json',
    ]],
    *[f'ci-logs/deno-shards-{name}.log' for name in [
        'before', 'node', 'deno', 'workflows', 'lint', 'format',
    ]],
], 'docs/case-studies/issue-56/data/ci-deno-shards.tar.gz', {
    'parent': '9d805e4fdb1fded3d408eb97fbe4db4da32d5c87',
    'checks_run': 43193074875, 'cancelled_job': 131100508779,
    'node': 23, 'deno': 23, 'deadline_minutes': 10,
    'remaining': 'Exact new-head hosted checks and every unfinished issue criterion.',
}, 'no-ci-deno-screenshot', before={
    '.github/workflows/release.yml': '9d805e4fdb1fded3d408eb97fbe4db4da32d5c87',
    'js/tests/ci-contracts.test.js': '9d805e4fdb1fded3d408eb97fbe4db4da32d5c87',
})
