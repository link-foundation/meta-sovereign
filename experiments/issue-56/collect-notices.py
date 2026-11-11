"""Retain finite notice regressions, shared controls and actual-parent evidence."""
from pathlib import Path
import subprocess
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
assert 'fail 1' in (root / 'ci-logs/notices-before-node.log').read_text()
assert 'missingNoticeReply' in (root / 'ci-logs/notices-before-ui.log').read_text()
assert 'pass 72' in (root / 'ci-logs/notices-node.log').read_text()
assert '72 passed | 0 failed' in (root / 'ci-logs/notices-deno.log').read_text()
assert '"cases":6,"providerSends":0' in (root / 'ci-logs/notices-after-ui.log').read_text()
assert '[e2e-profile-navigation] OK (chromium)' in (root / 'ci-logs/notices-profile-browser.log').read_text()
assert not (root / 'ci-logs/notices-lint.log').read_text()
assert 'ERROR:' not in (root / 'ci-logs/notices-duplication.log').read_text()
changed = subprocess.check_output([
    'git', 'ls-files', '--modified', '--others', '--exclude-standard', '-z'],
    cwd=root).decode().split('\0')
sources = [name for name in changed if name and not name.startswith(
    'docs/case-studies/issue-56/data/')]
logs = [str(path.relative_to(root)) for path in (root / 'ci-logs').glob('notices-*')
        if path.is_file() and path.suffix in ('.log', '.json')
        and not path.name.endswith(('-commit.log', '-push.log', '-archive.log', '-pr.log'))]
bundle(root, [*sources, *logs,
    'js/tests/helpers/e2e-browser-scenarios.mjs',
    'js/src/automation/question-match.js',
], 'docs/case-studies/issue-56/data/question-notices.tar.gz', {
    'parent': 'e172fd11a6f8dea07b8528051374e498871b21ab',
    'node': 72, 'deno': 72, 'chromium_notice_cases': 6,
    'chromium_profile_cases': 2, 'provider_sends_in_browser': 0,
    'mcp': 'reviewed text, proposed/approved no-reply, request refusal, 390px layout',
    'remaining': 'History learning, generalized patterns, pending-turn/activity guards, inactive notice/rejection delivery, unread orchestration and every unchecked issue criterion.',
}, 'notice-*.png', before={
    name: 'e172fd11' for name in [
        'js/src/automation/question-answers.js',
        'js/src/web/question-controls.js',
        'js/tests/helpers/e2e-question-shared-profile.mjs',
    ]
})
