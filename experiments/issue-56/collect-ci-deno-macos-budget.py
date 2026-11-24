"""Retain the cold setup budget and exact eight-partition regression evidence."""
import json
import subprocess
from evidence_bundle import evidence_context, evidence_logs, write_entries_archive

root, logs, read = evidence_context(__file__, 'ci-deno-macos-budget')
annotation = json.loads((logs / 'ci-deno-macos-budget-annotations.json').read_text())
assert any('maximum execution time of 10m0s' in row['message'] for row in annotation)
assert 'fail 1' in read('before') and "'1/6'" in read('before') and "'8/8'" in read('before')
assert 'pass 22' in read('focused') and 'fail 0' in read('focused')
assert '1 passed | 0 failed' in read('native')
assert all(not read(name).strip() for name in ('lint', 'secrets', 'diff'))
assert 'All matched files use Prettier code style!' in read('format-check')
assert 'ERROR:' not in read('duplication')
raw = (logs / 'vacancy-modern-parent-deno-cancelled.log').read_text()
assert '| 1280 passed (156 steps) | 0 failed | 3 ignored' in raw
assert 'The operation was canceled.' in raw
names = evidence_logs(root, 'ci-deno-macos-budget') + [
    '.github/workflows/release.yml', 'js/tests/ci-deno-shards.test.js',
    'js/tests/ci-contracts.test.js', 'PLAN.md',
    'experiments/issue-56/collect-ci-deno-macos-budget.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-deno-macos-budget.md',
    'ci-logs/vacancy-modern-parent-deno-cancelled.log',
]
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
revision = '7439bcd92258ab7a51f7a762a322dd9eaa75f8b2'
entries['before/release.yml'] = subprocess.check_output(
    ['git', 'show', revision + ':.github/workflows/release.yml'], cwd=root)
entries['metadata.json'] = json.dumps(dict(
    failedSource='4114717bd0adf286007f02e8067b9e409f82d03c', parent=revision,
    nativePartitions=8, deadlineMinutes=10, focusedNodePassed=22,
    nativeDenoPassed=1, hostedVerificationRequired=True,
    acceptedInventoryRows=[], issueComplete=False,
), indent=2).encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-deno-macos-budget.tar.gz', entries)
