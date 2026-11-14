"""Preserve actual-parent pending-turn failures and bounded verification."""
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
prefix = 'pending-turn'
parent = 'd4d04df2'
log = lambda name: (root / f'ci-logs/{prefix}-{name}.log').read_text()
assert 'fail 4' in log('before-node')
assert '"before":true' in log('before-ui')
assert 'pass 69' in log('node')
assert '69 passed | 0 failed' in log('deno')
assert 'pass 9' in log('final-node')
assert '9 passed | 0 failed' in log('final-deno')
assert '"cases":4,"before":false' in log('after-ui')
assert '"recoveredWithoutReplay":true' in log('mcp')
assert not log('lint')
sources = changed_sources(root, parent)
logs = evidence_logs(root, prefix, ('.log', '.json', '.png'))
bundle(root, [*sources, *logs,
    'experiments/issue-56/question-browser-server.mjs',
    'experiments/issue-56/question-browser-fixture.mjs',
    'experiments/issue-56/question-watch-fixture.mjs',
], f'docs/case-studies/issue-56/data/{prefix}.tar.gz', {
    'parent': parent, 'distinct_focused_checks': 70,
    'compatibility_node': 69, 'compatibility_deno': 69,
    'final_pending_node': 9, 'final_pending_deno': 9,
    'chromium_cases': 4, 'text_sends': 0,
    'mcp': 'two pending messages, stale-context refusal, explicit one-click delivery, recovery without replay, desktop and 390px layout',
    'remaining': 'Complete provider history, whole-turn planning/activity/delivery guards, acknowledgements/rejections, unread orchestration and all unchecked issue criteria.',
}, 'issue-56-pending-turn/*.png', before={
    name: parent for name in [
        'js/src/sources/browser-choice-controller.js',
        'js/src/sources/browser-choice-reader.js',
        'js/src/automation/question-browser-state.js',
        'js/src/web/question-browser-controls.js',
    ]
})
