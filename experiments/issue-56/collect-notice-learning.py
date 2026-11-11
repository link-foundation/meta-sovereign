"""Preserve actual-parent notice learning failures and focused verification."""
from pathlib import Path
import sys
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
patterns = '--patterns' in sys.argv
prefix = 'notice-patterns' if patterns else 'notice-learning'
parent = 'bd871352' if patterns else '66a1949f'
checks = 67 if patterns else 51
log = lambda name: (root / f'ci-logs/{prefix}-{name}.log').read_text()
assert 'fail 1' in log('before-node')
assert ('missingNoticePatterns' if patterns else 'missingNoticeLearning') in log('before-ui')
assert f'pass {checks}' in log('node')
assert f'{checks} passed | 0 failed' in log('deno')
assert '"cases":3,"providerSends":0' in log('after-ui')
assert not log('lint')
sources = changed_sources(root)
logs = evidence_logs(root, prefix, ('.log', '.json', '.png'))
bundle(root, [*sources, *logs,
    'js/src/automation/question-store.js',
    'js/src/automation/question-notices.js',
    'experiments/issue-56/notice-fixture.mjs',
], f'docs/case-studies/issue-56/data/{prefix}.tar.gz', {
    'parent': parent,
    'node': checks, 'deno': checks, 'chromium_cases': 3, 'provider_sends': 0,
    'mcp': 'actual count 2, pattern review and saving, desktop and 390px layout'
        if patterns else 'actual count 2, one proposal, saving, desktop and 390px layout',
    'remaining': 'Complete pending-turn/activity guards, automatic acknowledgements/rejections, unread orchestration and all unchecked issue criteria.',
}, f'{prefix}-*.png', before={
    name: parent for name in [
        'js/src/automation/question-learning.js',
        'js/src/automation/question-corrections.js',
        'js/src/web/question-controls.js',
    ]
})
