"""Archive the bounded existing-view unread pass and its remaining history limit."""
import json
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = 'eca91d6b50955b89c02c43d105c8090d32a4c7af'
read = lambda name: (root / f'ci-logs/chat-navigation-{name}.log').read_text()
assert 'scanUnreadConversations is not a function' in read('before-test')
assert 'Both working sources restored' in read('before-summary')
assert 'pass 27' in read('node-final') and 'fail 0' in read('node-final')
assert '27 passed | 0 failed' in read('deno-final')
assert 'pass 6' in read('contracts') and 'fail 0' in read('contracts')
for name, cases in [('browser-final', 4), ('guards-final', 8), ('stop-final', 2)]:
    assert f'"cases":{cases}' in read(name)
for name in ['lint-final', 'secretlint']:
    assert not read(name).strip()
assert 'ERROR' not in read('duplication')
mcp = json.loads(read('mcp-result').split('### Result\n', 1)[1].split('\n', 1)[0])
assert mcp['cases'] == 2 and mcp['pageErrors'] == []
assert mcp['results'][0]['restoration']['restored'] is True
assert mcp['results'][0]['restoration']['history'] == {
    'positionRestored': True, 'lengthBefore': 2, 'lengthAfter': 3}
assert mcp['results'][1]['restoration']['reason'] == 'owner-active'
assert all(result['state']['sends'] == 0 for result in mcp['results'])
bundle(root, [*changed_sources(root), *evidence_logs(root, 'chat-navigation')],
       'docs/case-studies/issue-56/data/chat-navigation.tar.gz', {
           'parent': parent, 'node_checks': 27, 'deno_checks': 27,
           'registry_checks': 6, 'actual_parent_regressions': 1,
           'native_navigation_cases': 14, 'independent_mcp_cases': 2,
           'live_provider': False, 'coverage_complete': False,
           'history_length_preserved': False,
           'remaining': 'Unchanged history length, safe repeated unread orchestration, '
                        'policy delivery, public controls and every unchecked criterion.',
       }, 'issue-56-chat-navigation/*.png', before={
           name: parent for name in ['js/src/sources/browser-sender.js',
                                    'js/src/sources/browser-chat-scan.js']
       })
