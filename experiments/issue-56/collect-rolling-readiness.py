"""Preserve actual hosted failure and finite readiness regression evidence."""
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'fail 1' in (logs / 'ci-question-watch-readiness-before.log').read_text()
assert 'pass 7' in (logs / 'ci-question-watch-readiness-node.log').read_text()
assert 'pass 3' in (logs / 'ci-question-watch-readiness-final-node.log').read_text()
assert '5 passed | 0 failed' in (logs / 'ci-question-watch-readiness-deno.log').read_text()
bundle(root, [
    '.github/workflows/release.yml',
    'js/src/server/rolling-control.js',
    'js/tests/rolling-cli.test.js', 'js/tests/rolling-control.test.js',
    'js/tests/rolling-cli-readiness.test.js',
    'js/tests/helpers/rolling-cli-readiness.mjs',
    'experiments/issue-56/rolling-readiness-before.py',
    'experiments/issue-56/collect-rolling-readiness.py',
    'docs/case-studies/issue-56/ci-question-watch-readiness.md',
    'ci-logs/question-watch-bun-windows-130475302851.log',
    'ci-logs/question-watch-parent-final-status.json',
    'ci-logs/question-watch-parent-final-jobs.json',
    'ci-logs/question-watch-final-parent-runs.json',
    *[str(path.relative_to(root)) for path in logs.glob('ci-question-watch-readiness-*.log')],
], 'docs/case-studies/issue-56/data/ci-question-watch-readiness.tar.gz', {
    'parent': '4e8662552c17be20651efd3654d335811139d193',
    'failing_ci_head': '2b0f655754a67f0f9a06324adc0a88158cae5093',
    'failing_ci_job': 130475302851,
    'focused_node_pass': 7, 'final_probe_pass': 3, 'focused_deno_pass': 5,
    'before_fail': 1,
    'limit': 'Windows delay cause is unproven; exact-head hosted validation remains required.',
}, 'issue-56-no-screenshots/*.png', before={
    'js/tests/rolling-cli.test.js': '4e866255',
    'js/src/server/rolling-control.js': '4e866255',
    '.github/workflows/release.yml': '4e866255',
})
