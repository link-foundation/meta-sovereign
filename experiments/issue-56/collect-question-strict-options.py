"""Freeze focused guard tests, primary references and the unchanged parent."""
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
for name, expected in [('node', 'pass 77'), ('deno', '49 passed | 0 failed'), ('final-node', 'pass 12'), ('final-deno', '12 passed | 0 failed'), ('before', 'fail 11')]:
    assert expected in (root / f'ci-logs/question-strict-options-{name}.log').read_text()
for name in ['lint', 'secretlint']:
    assert not (root / f'ci-logs/question-strict-options-{name}.log').read_text().strip()
production = [
    'js/src/automation/question-answers.js',
    'js/src/automation/answer-model-preview.js',
    'js/src/automation/question-chat-turn.js',
    'js/src/automation/automations.js',
    'js/src/automation/question-store.js',
    'js/src/automation/deliver.js',
    'js/src/sources/browser-sender.js',
]
bundle(root, [
    *production,
    'js/src/automation/question-options.js',
    'js/tests/question-strict-options.test.js',
    'experiments/issue-56/question-strict-options-before.py',
    'experiments/issue-56/collect-question-strict-options.py',
    'docs/case-studies/issue-56/question-strict-options.md',
    'ci-logs/qa-buttons-reference-head.json',
    'ci-logs/qa-buttons-reference-prs.json',
    *[str(p.relative_to(root)) for p in (root / 'ci-logs/qa-buttons-reference').iterdir()],
    *[f'ci-logs/question-strict-options-{name}.log' for name in [
        'before', 'before-summary', 'node', 'deno', 'final-node', 'final-deno',
        'format-check', 'lint', 'secretlint', 'build', 'duplication']],
    'ci-logs/question-strict-options-ci-runs.json',
    'ci-logs/question-strict-options-head-ci.json',
], 'docs/case-studies/issue-56/data/question-strict-options.tar.gz', {
    'parent': '19605f22ffc980aee8514e93092ea9bb24a404c8',
    'before': {'failed': 11, 'passed': 1},
    'node': 77, 'deno': 49, 'final_guard_node': 12, 'final_guard_deno': 12,
    'remaining': 'Actual browser choice execution and every unchecked issue requirement.',
}, 'no-strict-options-visual-change', before={name: '19605f22' for name in production})
