"""Collect reviewed publication research, finite regressions and browser proof."""
from pathlib import Path
import json
from evidence_bundle import bundle

root = Path(__file__).resolve().parents[2]
assert 'pass 77' in (root / 'ci-logs/assignment-publication-node.log').read_text()
assert '45 passed | 0 failed' in (root / 'ci-logs/assignment-publication-deno.log').read_text()
assert 'fail 2' in (root / 'ci-logs/assignment-publication-recovery-before.log').read_text()
assert 'server-backed assignment publisher exists' in (root / 'ci-logs/assignment-publication-browser-before.log').read_text()
assert '[e2e-forms-reader] OK (chromium)' in (root / 'ci-logs/assignment-publication-browser.log').read_text()
assert not (root / 'ci-logs/assignment-publication-eslint.log').read_text().strip()
assert not (root / 'ci-logs/assignment-publication-secretlint.log').read_text().strip()
observed = json.loads((root / 'ci-logs/assignment-publication-mcp-server.log').read_text().splitlines()[-1])
assert observed['submissions'] == 0
assert all(row['closed'] for row in observed['reads'])
assert observed['publication']['repositories'] == observed['publication']['issues'] == observed['publication']['modelCalls'] == 1
assert observed['publication']['pipeline'] is True
assert observed['publication']['calls'].count('create') == 1
assert observed['publication']['calls'].count('create-issue') == 1
files = json.loads((root / 'ci-logs/assignment-publication-review-files.json').read_text())
sources = [
    *files,
    'experiments/issue-56/collect-assignment-publication.py',
    'experiments/issue-56/assignment-publication-recovery-before.py',
    'ci-logs/assignment-reference-source.mjs',
    'ci-logs/assignment-reference-tests.mjs',
    'ci-logs/assignment-hivemind-ci.md',
    'ci-logs/assignment-publisher-issue56.md',
    'ci-logs/assignment-publisher-latest-issue.json',
    'ci-logs/assignment-publisher-subissues.json',
    'ci-logs/assignment-issue56-comments.json',
    'ci-logs/assignment-pr57-conversation.json',
    'ci-logs/assignment-pr57-inline.json',
    'ci-logs/assignment-pr57-reviews.json',
    'ci-logs/assignment-reference-prs.json',
    'ci-logs/assignment-publisher-current-runs.json',
    'ci-logs/assignment-publisher-current-jobs.json',
    'ci-logs/assignment-publication-2113-final.json',
    'ci-logs/checks-42961487507-full.log',
    'ci-logs/checks-42964992347-job-130341086349.log',
    'ci-logs/assignment-publication-macos-cancelled-job.json',
    'ci-logs/assignment-publication-macos-cancelled-annotations.json',
    *[f'ci-logs/assignment-publication-{suffix}.log' for suffix in [
        'node', 'deno', 'eslint', 'format', 'secretlint', 'duplication',
        'build-web', 'browser-before', 'browser', 'mcp', 'mcp-server',
        'mcp-console', 'recovery-before', 'recovery-before-summary']],
]
bundle(root, sources, 'docs/case-studies/issue-56/data/assignment-publication.tar.gz', {
    'node': 77, 'deno': 45,
    'remote_writes': 'Synthetic adapters only; tiny Git history cases use owned local repositories.',
    'mcp': observed,
    'remaining': 'Authenticated live provider/model execution, linked-document acquisition, complete handoff/notifications, current-head CI and all unchecked issue requirements.',
}, 'issue-56-assignment-publication-*.png', before={name: '5518950583567ffa083ccb352793b90690a26969' for name in [
    'js/src/forms/reader.js', 'js/src/forms/review-sessions.js',
    'js/src/cli/forms-assignment-commands.js', 'js/src/server/routes-forms.js',
    'js/src/web/forms-api.js', 'js/src/web/form-assignment.js',
    'js/src/web/forms-view.js', 'js/tests/e2e-forms-reader-browser.mjs',
]})
