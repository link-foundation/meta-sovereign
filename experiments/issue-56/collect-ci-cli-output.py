"""Collect exact CI failures and bounded CLI output regressions."""
from pathlib import Path
import json
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
assert 'fail 2' in (root / 'ci-logs/cli-output-before-two.log').read_text()
assert 'pass 2' in (root / 'ci-logs/cli-output-focused-node.log').read_text()
assert 'pass 1' in (root / 'ci-logs/cli-output-rolling-trace.log').read_text()
assert '4 passed | 0 failed' in (root / 'ci-logs/cli-output-deno.log').read_text()
assert '1 passed | 0 failed' in (root / 'ci-logs/cli-output-private-stderr-deno.log').read_text()
for name in ['lint', 'secretlint']:
    assert not (root / f'ci-logs/cli-output-{name}.log').read_text().strip()
run = json.loads((root / 'ci-logs/assignment-source-ci-run-latest.json').read_text())
assert run['head_sha'] == '9feb1d62fd70f48fbe9d1e4e191bb2877f59e03d'
assert run['status'] == 'completed' and run['conclusion'] == 'failure'
bundle(root, [
    *json.loads((root / 'ci-logs/cli-output-review-files.json').read_text()),
    'ci-logs/assignment-source-ci-run-latest.json',
    'ci-logs/assignment-source-completed-jobs.json',
    'ci-logs/checks-42968481378-full.log',
    *[f'ci-logs/checks-42968481378-job-{job}.log' for job in [
        130352711883, 130352712296, 130362160587]],
    *[f'ci-logs/cli-output-{name}.log' for name in [
        'before', 'before-two', 'before-summary', 'focused-node', 'node',
        'rolling-trace', 'deno', 'private-stderr-deno', 'lint', 'format', 'secretlint']],
    'ci-logs/cli-output-node-process-docs.md',
    'ci-logs/cli-output-node-child-process-docs.md',
    'ci-logs/cli-output-current-named-runs.json',
    'ci-logs/cli-output-source-checks-jobs-latest.json',
], 'docs/case-studies/issue-56/data/ci-cli-output.tar.gz', {
    'before_failures': 2, 'node_output': 2, 'node_rolling_trace': 1,
    'deno': 4, 'deno_private_stderr': 1,
    'remote_writes': 'None; real CLI uses owned temporary stores and local HTTP.',
    'remaining': 'Current-head hosted Windows confirmation, exact Git failure root cause, separate initial-readiness observation and every unchecked issue requirement.',
}, 'no-cli-output-screenshot', before={
    name: '2329461bb6fb7dd0f18d104728735967a70cdd83' for name in [
        'js/bin/meta-sovereign.js', 'js/tests/rolling-cli.test.js',
        'js/tests/assignment-template-history.test.js',
    ]
})
