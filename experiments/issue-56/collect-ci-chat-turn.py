"""Preserve the actual runtime regression and focused opt-in correction."""
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
assert 'fail 1' in (root / 'ci-logs/question-context-before-fix.log').read_text()
assert 'pass 38' in (root / 'ci-logs/question-context-after-fix.log').read_text()
assert '38 passed | 0 failed' in (root / 'ci-logs/question-context-deno.log').read_text()
assert not (root / 'ci-logs/question-context-lint.log').read_text().strip()
logs = sorted(root.glob('ci-logs/checks-42956946192-job-*.log'))
assert len(logs) == 9
assert all('AssertionError' in p.read_text() for p in logs)
sources = [
    'js/src/automation/question-chat-turn.js',
    'js/src/automation/automations.js',
    'js/src/automation/question-store.js',
    'js/tests/chat-answer-model.test.js',
    'js/tests/question-context.test.js',
    'docs/case-studies/issue-56/ci-chat-turn-opt-in.md',
    'experiments/issue-56/collect-ci-chat-turn.py',
    'ci-logs/assignment-parent-runs.json',
    'ci-logs/assignment-parent-checks.json',
    *[str(p.relative_to(root)) for p in logs],
    *[f'ci-logs/question-context-{name}.log' for name in [
        'before-fix', 'after-fix', 'deno', 'lint', 'format-check']],
]
bundle(root, sources, 'docs/case-studies/issue-56/data/ci-chat-turn-opt-in.tar.gz',
       {'preceding_head': '50ddab328ff15b8185ce993681d1bf5905c4aaa4',
        'node': 38, 'deno': 38, 'failed_runtime_jobs': 9,
        'remaining': 'Exact new-head hosted CI and every unchecked issue criterion.'},
       'no-ci-chat-turn-images-*.png', before={
           'js/src/automation/question-chat-turn.js':
               '50ddab328ff15b8185ce993681d1bf5905c4aaa4'})
