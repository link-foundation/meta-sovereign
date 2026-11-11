"""Preserve exact hosted failures, finite browser timings and routing coverage."""
from pathlib import Path
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
assert 'pass 18' in (root / 'ci-logs/question-groups-contracts.log').read_text()
assert '18 passed | 0 failed' in (root / 'ci-logs/question-groups-deno.log').read_text()
assert '[e2e-question-controls] OK (chromium)' in (
    root / 'ci-logs/question-groups-controls.log').read_text()
assert '[e2e-profile-navigation] OK (webkit)' in (
    root / 'ci-logs/question-profile-navigation-final.log').read_text()
files = [
    'package.json', 'js/scripts/browser-checks.json',
    'js/scripts/run-browser-checks.mjs', '.github/workflows/release.yml',
    'js/tests/ci-contracts.test.js', 'js/tests/e2e-questions-browser.mjs',
    'js/tests/helpers/e2e-browser-scenarios.mjs',
    'js/tests/helpers/e2e-input-trace.mjs',
    *[f'js/tests/e2e-question-{name}-browser.mjs' for name in [
        'providers', 'chat-lists', 'controls']],
    'experiments/issue-56/question-groups-before.py',
    'experiments/issue-56/question-profile-navigation.mjs',
    'experiments/issue-56/collect-question-groups.py',
    'docs/case-studies/issue-56/ci-question-groups.md',
    *[f'ci-logs/{name}' for name in [
        'hh-chat-scan-parent-webkit-130487773262.log',
        'hh-chat-scan-parent-pipeline-130499576408.log',
        'hh-history-parent-chromium-130501372720.log',
        'question-groups-parent-webkit-130501373014.log',
        'question-groups-parent-pipeline-130513037813.log',
        'question-groups-parent-final.json',
        'question-groups-parent-webkit-job.json',
        'question-groups-head-runs-latest.json',
        'question-groups-head-checks-latest.json',
        'question-groups-head-macos-node-130512842724.log',
        'question-profile-navigation.log',
        'question-profile-navigation-final.log',
    ]],
    *[f'ci-logs/question-groups-{name}.log' for name in [
        'before', 'contracts', 'deno', 'providers', 'controls',
        'lint', 'format', 'duplication', 'secrets']],
]
bundle(root, files, 'docs/case-studies/issue-56/data/ci-question-groups.tar.gz', {
    'node': 18, 'deno': 18, 'chromium_timing_cases': 59,
    'chromium_controls_cases': 18, 'webkit_targeted_profiles': 2,
    'subprocess_deadline_ms': 180000, 'browser_job_deadline_minutes': 35,
    'remaining': 'Exact-head CI, hidden WebKit preview and macOS startup causes; all unchecked issue scope.',
}, 'no-ci-question-groups-screenshot', before={
    name: 'fb6fc9d2' for name in [
        'package.json', 'js/scripts/browser-checks.json',
        'js/tests/e2e-questions-browser.mjs',
        'js/tests/helpers/e2e-input-trace.mjs',
    ]
})
