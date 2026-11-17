"""Keep the actual macOS cancellation and bounded partition correction."""
from pathlib import Path
import json
from evidence_bundle import write_hashed_archive

root = Path(__file__).resolve().parents[2]
job = json.loads((root / 'ci-logs/8c22-deno-macos-2-job.json').read_text())
assert job['conclusion'] == 'cancelled'
assert job['steps'][13]['name'] == 'Run tests (Deno)'
assert 'The operation was canceled.' in (root / 'ci-logs/8c22-deno-macos-2.log').read_text()
before = (root / 'ci-logs/ci-deno-macos-shards-before.log').read_text()
after = (root / 'ci-logs/ci-deno-macos-shards-after.log').read_text()
assert 'fail 1' in before and '1/3' in before and '1/6' in before
assert 'pass 2' in after and 'fail 0' in after
native = (root / 'ci-logs/ci-deno-macos-shards-deno.log').read_text()
assert '2 passed' in native and '0 failed' in native
names = [
    '.github/workflows/release.yml', 'js/tests/ci-contracts.test.js',
    'js/tests/ci-deno-shards.test.js',
    'ci-logs/8c22-deno-macos-2-job.json', 'ci-logs/8c22-deno-macos-2.log',
    'ci-logs/8c22-run-list.json', 'ci-logs/8c22-current-jobs.json',
    'ci-logs/ci-deno-macos-shards-before.log',
    'ci-logs/ci-deno-macos-shards-after.log',
    'ci-logs/ci-deno-macos-shards-deno.log',
    'ci-logs/ci-deno-macos-existing-before.log',
    'experiments/issue-56/collect-ci-deno-macos-partitions.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-deno-macos-partitions.md',
]
write_hashed_archive(root,
    root / 'docs/case-studies/issue-56/data/ci-deno-macos-partitions.tar.gz',
    names, dict(acceptance=False, hostedResult='pending',
                failedSource='8c2260b6dc99ad04e44f2b2001b774be98b0ede5',
                productionChanged=False, focusedTests=2), 3)
