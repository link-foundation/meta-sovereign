"""Preserve the actual macOS deadline failure and focused shard contracts."""
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
assert 'pass 18' in (root / 'ci-logs/ci-macos-redistribution-node.log').read_text()
assert '18 passed | 0 failed' in (root / 'ci-logs/ci-macos-redistribution-deno.log').read_text()
bundle(root, [
    '.github/workflows/release.yml', 'js/tests/ci-node-shards.test.js',
    'docs/case-studies/issue-56/ci-macos-shards.md',
    'experiments/issue-56/collect-ci-macos-shards.py',
    'ci-logs/ci-macos-redistribution-parent-jobs.json',
    'ci-logs/ci-macos-redistribution-runs.json',
    'ci-logs/assignment-publication-macos-cancelled-annotations.json',
    'ci-logs/assignment-publication-macos-cancelled-job.json',
    *[f'ci-logs/checks-42964992347-job-{job}.log' for job in [
        130341086349, 130341086233, 130349340570]],
    *[f'ci-logs/ci-macos-redistribution-{name}.log' for name in [
        'node', 'deno', 'format', 'lint']],
], 'docs/case-studies/issue-56/data/ci-macos-shards.tar.gz', {
    'node': 18, 'deno': 18, 'deadline_minutes': 10,
    'remaining': 'Current-head hosted matrix and every unchecked issue requirement.',
}, 'no-ci-macos-screenshot', before={
    '.github/workflows/release.yml': 'dd155b0c55a7c7bf76a29f347830f8fe618660c5',
    'js/tests/ci-node-shards.test.js': 'dd155b0c55a7c7bf76a29f347830f8fe618660c5',
})
