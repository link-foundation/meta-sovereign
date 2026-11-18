"""Retain observed startup costs without claiming an unproven hosted cause."""
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
for name in ['before', 'after']:
    assert 'pass 1' in (root / f'ci-logs/rolling-startup-{name}.log').read_text()
assert 'pass 5' in (root / 'ci-logs/rolling-startup-focused-node.log').read_text()
assert '5 passed | 0 failed' in (root / 'ci-logs/rolling-startup-focused-deno.log').read_text()
sources = [
    'js/bin/meta-sovereign.js', 'js/src/cli/rolling-serve.js',
    'js/src/server/rolling-release.js', 'js/tests/rolling-cli.test.js',
]
bundle(root, [
    *sources, 'js/tests/helpers/rolling-cli-readiness.mjs',
    'js/tests/rolling-cli-readiness.test.js', 'js/tests/cli-output.test.js',
    'experiments/issue-56/rolling-startup-profile.mjs',
    'experiments/issue-56/collect-rolling-startup.py',
    'docs/case-studies/issue-56/ci-rolling-startup.md',
    'ci-logs/question-groups-head-macos-node-130512842724.log',
    'ci-logs/question-groups-head-checks-latest.json',
    'ci-logs/rolling-startup-current-runs.json',
    'ci-logs/rolling-startup-parent-progress.json',
    *[f'ci-logs/rolling-startup-{name}.log' for name in [
        'before', 'after', 'focused-node', 'focused-deno', 'lint',
        'format', 'secrets', 'duplication']],
], 'docs/case-studies/issue-56/data/ci-rolling-startup.tar.gz', {
    'actual_cli_case': 1, 'focused_node': 5, 'focused_deno': 5,
    'production_trace_default': 'off', 'readiness_budget_ms': 10000,
    'remaining': 'Hosted root cause and actual correction; all unchecked issue requirements.',
}, 'no-ci-rolling-startup-screenshot', before={
    name: 'd1dd7d09' for name in sources
})
