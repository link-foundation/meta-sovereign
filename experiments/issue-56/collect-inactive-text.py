"""Retain the parent gap, draft race and verified inactive-delivery boundary."""
import json
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = '2b571a75'
read = lambda name: (root / f'ci-logs/inactive-text-{name}.log').read_text()
assert 'Actual parent lacks the owned inactive text operation.' in read('before')
assert '"sends":1' in read('child-focus-before')
assert '"code":"answer-text-changed"' in read('child-focus-after')
assert '"sends":0' in read('child-focus-after')
assert '"cases":9' in read('browser') and read('browser').count('PASS ') == 9
assert 'pass 39' in read('node') and 'fail 0' in read('node')
assert '18 passed | 0 failed' in read('deno')
compatibility = json.loads(read('compatibility').splitlines()[-1])
assert compatibility['history']['cases'] == 8
assert compatibility['explicit'] == ['ordinary-text', 'ordinary-choice']
observed = [json.loads(line) for line in read('platform-methods').splitlines()]
assert [row['activation'] for row in observed] == ['pointer', 'dom']
assert [row['focused'] for row in observed] == [True, False]
assert all(row['receipt']['messageId'] == '102' for row in observed)
mcp = json.loads((root / 'ci-logs/inactive-text-mcp-result.json').read_text())
assert mcp['cases'] == 3 and mcp['released'] == 2 and not mcp['pageErrors']
assert not mcp['liveProvider']
assert not read('lint') and not read('secrets')
assert 'All matched files use Prettier code style!' in read('format-check')
assert '38485 (6.48%)' in read('duplication')
bundle(root, [
    *changed_sources(root, parent),
    *(name for name in evidence_logs(root, 'inactive-text') if 'inactive-text-parent-' not in name),
    'ci-logs/inactive-text-mcp-code.js',
    'experiments/issue-56/question-browser-probe.mjs',
    'experiments/issue-56/text-reply-fixture.mjs',
    'experiments/issue-56/provider-choice-fixture.mjs',
    'experiments/issue-56/conversation-history-fixture.mjs',
    'js/tests/helpers/e2e-inactive-history.mjs',
], 'docs/case-studies/issue-56/data/inactive-text.tar.gz', {
    'parent': parent, 'local_fixture_only': True, 'live_provider': False,
    'draft_race_is_parent_regression': False,
    'node_checks': 39, 'deno_checks': 18, 'browser_cases': 9,
    'compatibility_cases': 10, 'independent_mcp_cases': 3,
    'remaining': 'Automatic policies, durable reservations, cross-chat/filter restoration, unread orchestration, public controls, live verification and every unchecked criterion.',
}, 'issue-56-inactive-text/*.png', before={
    'js/src/sources/browser-answer-watch.js': parent,
    'js/src/sources/browser-inactive-view.js': parent,
    'js/src/sources/browser-choice-controller.js': parent,
})
