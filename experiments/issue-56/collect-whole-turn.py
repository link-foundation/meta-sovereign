"""Preserve complete-turn regressions, UI evidence and observed hosted failures."""
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = '6dea5f91d16930e9e36935f58d238254961b0ed8'
read = lambda name: (root / f'ci-logs/whole-turn-{name}.log').read_text()
for name, expected in {
    'before-node': 'fail 4', 'before-ui': '"before":true',
    'node': 'pass 61', 'deno': '61 passed | 0 failed',
    'compatibility-final-node': 'pass 85',
    'final-node': 'pass 27', 'final-deno': '27 passed | 0 failed',
    'final-ui': '"cases":2,"before":false',
    'pending-ui': '"cases":4,"before":false',
    'final-mcp': '"wholeDraftPrefilled":true',
    'compat-mcp': '"clicks":1',
}.items():
    assert expected in read(name), name
assert not read('lint')
assert not read('secretlint')
assert 'ERROR:' not in read('duplication')
bundle(root, [*changed_sources(root, parent),
    *evidence_logs(root, 'whole-turn', ('.log', '.json', '.png')),
    'experiments/issue-56/question-browser-server.mjs',
    'experiments/issue-56/question-browser-fixture.mjs',
    'experiments/issue-56/question-watch-fixture.mjs',
    'experiments/issue-56/pending-turn-fixture.mjs',
], 'docs/case-studies/issue-56/data/whole-turn.tar.gz', {
    'parent': parent, 'parent_failing_assertions': 4,
    'initial_node_and_deno': 61, 'compatibility_node': 85,
    'final_node_and_deno': 27, 'chromium_cases': 2,
    'pending_chromium_cases': 4, 'whole_turn_text_sends': 0,
    'mcp': 'whole draft, response recovery, stale-context refusal, unresolved-answer hold, desktop/390px; preceding native probe clicks once',
    'remaining': 'Full provider history, activity ownership, inactive acknowledgements/rejections, unread orchestration, hosted failures and every unchecked issue criterion.',
}, 'issue-56-whole-turn/*.png', before={
    name: parent for name in [
        'js/src/automation/question-chat-turn.js',
        'js/src/automation/question-answers.js',
        'js/src/automation/question-watch-cycle.js',
        'js/src/web/question-browser-pending.js',
    ]
})
