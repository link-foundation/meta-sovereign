"""Preserve finite planning regressions and focused compatibility evidence."""
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
logs = root / 'ci-logs'
assert 'fail 3' in (logs / 'question-watch-planning-before.log').read_text()
assert 'pass 3' in (logs / 'question-watch-planning-after.log').read_text()
assert 'pass 42' in (logs / 'question-watch-planning-node.log').read_text()
assert '21 passed | 0 failed' in (logs / 'question-watch-planning-deno.log').read_text()
sources = [f'js/src/automation/{name}' for name in [
    'question-browser.js', 'question-browser-watch.js',
    'question-watch-cycle.js', 'question-watch-records.js',
]]
bundle(root, [
    *sources,
    'js/tests/question-watch-planning.test.js',
    'experiments/issue-56/question-watch-fixture.mjs',
    'experiments/issue-56/question-browser-fixture.mjs',
    'experiments/issue-56/question-watch-planning-before.py',
    'experiments/issue-56/collect-question-watch-planning.py',
    'docs/case-studies/issue-56/question-watch-planning.md',
    *[str(path.relative_to(root)) for path in logs.glob('question-watch-planning-*.log')],
], 'docs/case-studies/issue-56/data/question-watch-planning.tar.gz', {
    'parent': '2b0f655754a67f0f9a06324adc0a88158cae5093',
    'focused_node_pass': 42, 'focused_deno_pass': 21,
    'before_fail': 3, 'live_provider': False,
    'remaining': 'All-unread orchestration, live provider parity and all unchecked criteria.',
}, 'issue-56-no-screenshots/*.png', before={name: '2b0f6557' for name in sources})
