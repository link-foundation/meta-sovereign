"""Preserve the actual CodeQL review and the exact-payload assertion."""
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
assert 'pass 12' in (root / 'ci-logs/assignment-source-url-node.log').read_text()
assert '12 passed | 0 failed' in (root / 'ci-logs/assignment-source-url-deno.log').read_text()
for name in ['lint', 'secretlint']:
    assert not (root / f'ci-logs/assignment-source-url-{name}.log').read_text().strip()
bundle(root, [
    'js/tests/assignment-source.test.js',
    'experiments/issue-56/collect-ci-assignment-source-proof.py',
    'docs/case-studies/issue-56/ci-assignment-source-proof.md',
    'ci-logs/assignment-source-codeql-alert57.json',
    'ci-logs/qa-buttons-pr-inline.json',
    'ci-logs/qa-buttons-pr-reviews.json',
    'ci-logs/checks-42972596896-job-130365231240.log',
    *[f'ci-logs/assignment-source-url-{name}.log' for name in [
        'node', 'deno', 'lint', 'format', 'secretlint']],
], 'docs/case-studies/issue-56/data/ci-assignment-source-proof.tar.gz', {
    'node': 12, 'deno': 12,
    'remaining': 'Current-head CodeQL verification and every unchecked issue requirement.',
}, 'no-assignment-source-proof-screenshot', before={
    'js/tests/assignment-source.test.js': '2329461bb6fb7dd0f18d104728735967a70cdd83',
})
