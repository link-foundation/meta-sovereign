"""Archive exact owned-suffix reuse, owner revocation and finite capacity evidence."""
import json
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = '82360a8f7e56cbdd306c9eb5977615bd58d6e460'
read = lambda name: (root / f'ci-logs/chat-repetition-{name}.log').read_text()
assert 'actual-parent-repeated-pass-refused' in read('before-browser')
assert 'Working navigation source restored' in read('before-summary')
assert 'pass 25' in read('node-final') and 'fail 0' in read('node-final')
assert '25 passed | 0 failed' in read('deno-final')
assert 'pass 12' in read('contracts') and 'fail 0' in read('contracts')
assert '"cases":5' in read('browser-final')
assert '"cases":2' in read('stop-final')
capacity = json.loads(read('capacity'))
assert capacity['pushes'] == 52 and capacity['nativeLength'] == 50
for name in ['lint-final', 'secretlint']:
    assert not read(name).strip()
assert 'ERROR' not in read('duplication')
mcp = json.loads(read('mcp-result').split('### Result\n', 1)[1].split('\n', 1)[0])
assert mcp['cases'] == 2 and mcp['pageErrors'] == []
assert mcp['results'][0]['repeated']['history']['reusedOwnedForward'] is True
assert mcp['results'][0]['repeated']['history']['lengthAfter'] == 3
assert mcp['results'][1]['restoration']['reason'] == 'owner-active'
assert all(result['state']['sends'] == 0 for result in mcp['results'])
bundle(root, [*changed_sources(root), *evidence_logs(root, 'chat-repetition')],
       'docs/case-studies/issue-56/data/chat-repetition.tar.gz', {
           'parent': parent, 'node_checks': 25, 'deno_checks': 25,
           'registry_checks': 12, 'actual_parent_regressions': 1,
           'native_repetition_cases': 5, 'native_stop_cases': 2,
           'independent_mcp_cases': 2, 'capacity_pushes': 52,
           'live_provider': False, 'coverage_complete': False,
           'original_history_length_preserved': False,
           'remaining': 'Persistent polling, policy delivery, shared public controls, '
                        'live providers and every unchecked criterion.',
       }, 'issue-56-chat-repetition/*.png', before={
           'js/src/sources/browser-chat-navigation.js': parent,
       })
