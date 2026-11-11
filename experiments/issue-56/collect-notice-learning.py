"""Preserve actual-parent notice learning failures and focused verification."""
from pathlib import Path
import subprocess
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
assert 'fail 1' in (root / 'ci-logs/notice-learning-before-node.log').read_text()
assert 'missingNoticeLearning' in (root / 'ci-logs/notice-learning-before-ui.log').read_text()
assert 'pass 51' in (root / 'ci-logs/notice-learning-node.log').read_text()
assert '51 passed | 0 failed' in (root / 'ci-logs/notice-learning-deno.log').read_text()
assert '"cases":3,"providerSends":0' in (root / 'ci-logs/notice-learning-after-ui.log').read_text()
assert not (root / 'ci-logs/notice-learning-lint.log').read_text()
changed = subprocess.check_output([
    'git', 'ls-files', '--modified', '--others', '--exclude-standard', '-z'],
    cwd=root).decode().split('\0')
sources = [name for name in changed if name and not name.startswith(
    'docs/case-studies/issue-56/data/')]
logs = [str(path.relative_to(root)) for path in (root / 'ci-logs').glob('notice-learning-*')
        if path.is_file() and path.suffix in ('.log', '.json', '.png')
        and not path.name.endswith(('-commit.log', '-push.log', '-archive.log', '-pr.log'))]
bundle(root, [*sources, *logs,
    'js/src/automation/question-store.js',
    'js/src/automation/question-notices.js',
    'experiments/issue-56/notice-fixture.mjs',
], 'docs/case-studies/issue-56/data/notice-learning.tar.gz', {
    'parent': '66a1949fb3e497060b68924f8be7559e6d3b0238',
    'node': 51, 'deno': 51, 'chromium_cases': 3, 'provider_sends': 0,
    'mcp': 'actual count 2, one proposal, saving, desktop and 390px layout',
    'remaining': 'Generalized patterns, complete pending-turn/activity guards, automatic acknowledgements/rejections, unread orchestration and all unchecked issue criteria.',
}, 'notice-learning-*.png', before={
    name: '66a1949f' for name in [
        'js/src/automation/question-learning.js',
        'js/src/automation/question-corrections.js',
        'js/src/web/question-controls.js',
    ]
})
