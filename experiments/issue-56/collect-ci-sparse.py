"""Preserve measured checkout overhead and finite sparse-merge regressions."""
import json
import subprocess
from pathlib import Path
from evidence_bundle import evidence_logs, write_entries_archive

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
for suffix, markers in {
    'before.log': ['fail 1', 'undefined'],
    'focused-node.log': ['pass 2', 'fail 0'],
    'focused-deno.log': ['2 passed | 0 failed'],
    'format-final.log': ['All matched files use Prettier code style!'],
}.items():
    assert all(v in (logs / ('ci-sparse-' + suffix)).read_text() for v in markers), suffix
for suffix in ['lint', 'secrets', 'diff']:
    assert not (logs / ('ci-sparse-' + suffix + '.log')).read_text().strip(), suffix
job = json.loads((logs / '06953e31-node-macos-3-job.json').read_text())
assert job['conclusion'] == 'cancelled' and job['head_sha'].startswith('06953e31')
raw = (logs / 'hosted-06953e31-node-macos-3.log').read_text()
assert 'The operation was canceled.' in raw and 'duration_ms=234065' in raw
names = [
    '.github/workflows/release.yml', 'js/tests/ci-filtered-checkout.test.js',
    'experiments/issue-56/ci-sparse-before.py',
    'experiments/issue-56/collect-ci-sparse.py',
    'experiments/issue-56/evidence_bundle.py',
    'docs/case-studies/issue-56/ci-runtime-evidence-checkout.md',
    'ci-logs/06953e31-node-macos-3-job.json',
    'ci-logs/hosted-06953e31-node-macos-3.log',
    'ci-logs/runtime-heavy-tree-sizes.log',
    'ci-logs/runtime-sparse-consumers.log',
    'ci-logs/checkout-v7-git-source-provider.ts',
    'ci-logs/checkout-v7-git-command-manager.ts',
]
names += evidence_logs(root, 'ci-sparse')
entries = {name: (root / name).read_bytes() for name in sorted(set(names))}
entries['before/.github/workflows/release.yml'] = subprocess.check_output(
    ['git', 'show', '06953e31:.github/workflows/release.yml'], cwd=root)
entries['metadata.json'] = json.dumps(dict(source='06953e31', acceptance=False,
    nodeChecks=2, denoChecks=2, timeoutMinutes=10,
    excludedPaths=['dev/log', 'docs/screenshots', 'docs/case-studies/issue-56/data'])).encode()
write_entries_archive(root / 'docs/case-studies/issue-56/data/ci-runtime-evidence-checkout.tar.gz', entries)
