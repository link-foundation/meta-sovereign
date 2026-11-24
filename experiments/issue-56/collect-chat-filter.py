"""Archive actual-parent filter regressions and bounded native ownership checks."""
import json
from pathlib import Path
from evidence_bundle import bundle, changed_sources, evidence_logs

root = Path(__file__).resolve().parents[2]
parent = 'a203a29c0df0d69ace4d5c7bcd2a749961498dc5'
read = lambda name: (root / f'ci-logs/chat-filter-{name}.log').read_text()
assert 'Missing expected exception' in read('before-test')
assert 'browser-chat-filter-owner-active' in read('inactive-before')
assert 'All three working sources restored' in read('before-summary')
assert 'pass 38' in read('node-final') and 'fail 0' in read('node-final')
assert '38 passed | 0 failed' in read('deno-final')
assert 'pass 1' in read('contract') and 'fail 0' in read('contract')
assert '[e2e-question-chat-lists] OK (chromium)' in read('browser-final')
assert '"cases":12' in read('browser-final')
assert '"cases":7' in read('browser-inactive-final')
assert 'inactive-native-filter-restored' in read('browser-inactive-final')
for name in ['lint-final', 'secretlint']:
    assert not read(name).strip()
assert 'ERROR' not in read('duplication')
mcp = json.loads(read('mcp-result').split('### Result\n', 1)[1].split('\n', 1)[0])
assert mcp['cases'] == 2 and mcp['pageErrors'] == []
assert mcp['results'][0]['filter']['restored'] is True
assert mcp['results'][1]['coverage']['reason'] == 'owner-active'
bundle(root, [*changed_sources(root), *evidence_logs(root, 'chat-filter')],
       'docs/case-studies/issue-56/data/chat-filter.tar.gz', {
           'parent': parent, 'node_checks': 38, 'deno_checks': 38,
           'registry_checks': 1, 'actual_parent_regressions': 2,
           'native_filter_cases': 7, 'preceding_native_group_cases': 20,
           'independent_mcp_cases': 2, 'live_provider': False,
           'coverage_complete': False,
           'remaining': 'Cross-chat restoration, unread orchestration, public controls and every unchecked criterion.',
       }, 'issue-56-chat-filter/*.png', before={
           name: parent for name in ['js/src/sources/browser-scan-options.js',
                                    'js/src/sources/browser-chat-scan.js',
                                    'js/src/sources/browser-inactive-view.js']
       })
