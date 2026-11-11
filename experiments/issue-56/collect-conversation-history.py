"""Preserve bounded transcript traversal, actual-parent failures and MCP evidence."""
import json
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
read = lambda name: (root / f'ci-logs/conversation-history-{name}.log').read_text()
assert 'fail 1' in read('before-node') and "'undefined'" in read('before-node')
assert json.loads(read('before-browser'))['unavailableBefore']
assert 'pass 19' in read('unit') and 'fail 0' in read('unit')
assert '"cases":15' in read('browser')
focused = read('focused-browser')
assert 'SKIP' not in focused and '[e2e-question-chat-lists] OK (chromium)' in focused
assert '"cases":16' in focused and 'close-drained' in focused
assert not read('lint') and not read('secrets')
assert 'ERROR' not in read('duplication') and 'Total:' in read('duplication')
mcp = json.loads((root / 'ci-logs/conversation-history-mcp.json').read_text())
result = json.loads(mcp['content'][0]['text'].split('### Result\n', 1)[1].split('\n###', 1)[0])
assert not result['errors'] and not result['liveProvider']
assert [item['coverage']['complete'] for item in result['outcomes']] == [True, True, False, False]
assert [item['owner']['top'] for item in result['outcomes'][:2]] == [300, -300]
assert all(not item['owner']['live'] and not item['owner']['clicks'] and not item['owner']['sends'] for item in result['outcomes'])
assert result['outcomes'][-1]['owner']['draft'] == 'New owner draft'
parent = 'e0b0bbdcd11b06679337a5c5b40e72f02da9af5d'
bundle(root, [
    *changed_sources(root, parent), *evidence_logs(root, 'conversation-history'),
    'experiments/issue-56/hh-chat-scan-fixture.mjs',
    'js/tests/hh-chat-scan.test.js', 'js/tests/helpers/e2e-hh-chat-scan.mjs',
    'js/tests/helpers/e2e-hh-chat-list.mjs',
], 'docs/case-studies/issue-56/data/conversation-history.tar.gz', {
    'parent': parent, 'before_failures': 1, 'node': 19,
    'standalone_browser_cases': 15, 'focused_history_cases': 16,
    'mcp': result,
    'remaining': 'Guarded background text delivery, shared orchestration, live provider verification, exact-head CI and all unchecked issue criteria.',
}, 'issue-56-conversation-history/*.png', before={
    f'js/src/sources/{name}.js': parent for name in (
        'browser-chat-list-state', 'browser-chat-scan', 'browser-sender', 'hh-web-ui')
})
