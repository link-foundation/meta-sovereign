"""Retain exact-parent ownership failures and finite native/MCP checks."""
import json
from evidence_bundle import bundle, changed_sources, evidence_context, evidence_logs

root, logs, read = evidence_context(__file__, 'reply-ownership')
assert 'pass 36' in read('focused') and 'fail 0' in read('focused')
assert 'pass 4' in read('registry') and 'fail 0' in read('registry')
assert '"maximum":2' in read('slow-parent') and '2 !== 1' in read('slow-parent')
assert '"maximum":1' in read('slow-fixed')
assert 'live peer versions ["alpha.0","alpha.2"]' in read('parent')
assert '[e2e-reply-cache-ownership] OK (webkit)' in read('native')
assert read('native').count('[reply-cache-ownership]') == 2
assert not read('lint').strip()
assert 'All matched files use Prettier code style!' in read('prettier')
assert '6.48%' in read('duplication') and 'ERROR: jscpd' not in read('duplication')
assert not read('secrets').strip()
for kind in ['indexedDB', 'localStorage']:
    def result(name):
        return json.loads((logs / f'reply-ownership-mcp-{name}.json').read_text())[kind]
    stale = result('parent-stale')
    assert stale['memory'] == 'alpha.0' and stale['saved'] == 'alpha.2'
    for step in ['after-live', 'after-stale-source', 'offline-reload']:
        state = result(step)
        assert state['memory'] == state['saved'] == state['text'] == 'alpha.2'
        assert state['errors'] == []
    assert not result('other-account')['ready']
bundle(root, changed_sources(root) + evidence_logs(root, 'reply-ownership'),
       'docs/case-studies/issue-56/data/reply-cache-ownership.tar.gz',
       dict(parent='80e93aa5e5bcd73b6e50ad244f92550c1eb5835d',
            focused_tests=36, ownership_tests=13, compatibility_tests=23,
            browser_registry_tests=4, local_browser='webkit',
            native_drivers=['indexedDB', 'localStorage'],
            independent_mcp_verified=True, unchanged_duplication_threshold=6.5,
            full_local_matrix=False, exact_head_ci_required=True,
            issue_complete=False), 'no-reply-cache-images-*',
       before={name: '80e93aa5' for name in [
           'js/src/replies/reply-cache.js', 'js/src/web/client.js',
           'js/src/web/dom.js']})
