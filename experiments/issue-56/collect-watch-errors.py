"""Preserve the actual failed job and deterministic watch diagnostic replay."""
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'AssertionError' in (logs / 'watch-errors-before.log').read_text()
assert '"replayed":1,"cases":5,"pageErrors":[]' in (logs / 'watch-errors-after.log').read_text()
assert 'pass 11' in (logs / 'watch-errors-node.log').read_text()
assert '11 passed | 0 failed' in (logs / 'watch-errors-deno.log').read_text()
assert not (logs / 'watch-errors-lint.log').read_text()
assert 'fail 1' in (logs / 'notices-routing-before.log').read_text()
assert 'pass 18' in (logs / 'notices-routing-node.log').read_text()
assert '18 passed | 0 failed' in (logs / 'notices-routing-deno.log').read_text()
fixtures = [f'js/tests/helpers/{name}.mjs' for name in [
    'e2e-question-browser-controls', 'e2e-question-browser-watch',
    'e2e-summary-choice', 'e2e-page-errors',
]]
bundle(root, [
    *fixtures, 'js/tests/e2e-page-errors.test.js',
    'js/tests/ci-contracts.test.js',
    'js/tests/e2e-question-controls-browser.mjs',
    'js/tests/e2e-questions-browser.mjs',
    'experiments/issue-56/watch-page-errors.mjs',
    'experiments/issue-56/collect-watch-errors.py',
    'docs/case-studies/issue-56/ci-watch-page-errors.md',
    'ci-logs/notices-parent-webkit-130526040908.log',
    'ci-logs/notices-parent-checks.json', 'ci-logs/notices-runs-latest.json',
    *[str(path.relative_to(root)) for path in logs.glob('watch-errors-*.log')
      if not path.name.endswith(('-archive.log', '-commit.log', '-push.log'))],
    *[str(path.relative_to(root)) for path in logs.glob('watch-errors-*.json')],
    *[str(path.relative_to(root)) for path in logs.glob('notices-routing-*.log')
      if not path.name.endswith(('-archive.log', '-commit.log', '-push.log'))],
], 'docs/case-studies/issue-56/data/ci-watch-page-errors.tar.gz', {
    'parent': '44d744a382491206ef46cd7cb73f0258ada6e3aa',
    'hosted_head': 'e172fd11a6f8dea07b8528051374e498871b21ab',
    'hosted_run': 43021212329, 'hosted_job': 130526040908,
    'before': 'all five watch behaviors pass, final assertion fails',
    'after': 'exactly one synthetic native diagnostic, five behaviors pass',
    'node': 11, 'deno': 11,
    'routing_before_fail': 1, 'routing_node': 18, 'routing_deno': 18,
    'remaining': 'New-head hosted CI, independent historical failures and every unchecked issue criterion.',
}, 'issue-56-no-screenshots/*.png', before={
    **{name: '44d744a3' for name in fixtures},
    'js/tests/e2e-question-controls-browser.mjs': '0e5769d5',
    'js/tests/e2e-questions-browser.mjs': '0e5769d5',
})
