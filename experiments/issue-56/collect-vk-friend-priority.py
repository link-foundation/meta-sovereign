"""Preserve finite parent/current priority controls and focused checks."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs, bundle,
    parent_reply_sources,
)

root, logs, read = evidence_context(__file__, 'friend-priority')
verify_evidence(read, {
    'node': ['pass 41', 'fail 0'],
    'deno': ['41 passed | 0 failed'],
    'node-final': ['pass 7', 'fail 0'],
    'deno-final': ['7 passed | 0 failed'],
    'format-final': ['All matched files use Prettier code style!'],
    'before-node': ['status|save|plan|run required', 'fail 1'],
})
assert 'SyntaxError' not in read('before-node')
assert json.loads(read('before-ui'))['missingPriorityActions'] is True
native = json.loads(read('after-ui'))
assert native['providerWrites'] == 0 and native['pageErrors'] == 0
assert native['liveProvider'] is False
assert all(value is True for name, value in native.items()
           if name not in ('providerWrites', 'pageErrors', 'liveProvider'))
inspection = json.loads((logs / 'friend-priority-mcp-result.json').read_text())
review = json.loads(inspection['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert [row['language'] for row in review['result']] == ['en', 'ru', 'zh', 'hi']
assert all(all(row[name] for name in (
    'translated', 'mergedOwnerPriorities', 'clearReloadRetained', 'desktopAndPhoneFit'))
    for row in review['result'])
assert review['pageErrors'] == 0 and review['liveProvider'] is False
assert all('404 (Not Found)' in error for error in review['consoleErrors'])
assert all(item['error'] == 'net::ERR_ABORTED' for item in review['requestFailures'])
assert json.loads(read('mcp-server').splitlines()[-1]) == {
    'providerWrites': 0, 'messages': 0, 'resourcesClosed': True, 'liveProvider': False,
}
sources = changed_sources(root)
assert len(list((root / 'docs/screenshots/issue-56-friend-priority').glob('*.png'))) == 16
parent = '54c952479634ce8a589b2a19c2e4a83f991d0387'
bundle(root, sources + evidence_logs(root, 'friend-priority'),
       'docs/case-studies/issue-56/data/vk-friend-priority.tar.gz', {
           'parent': parent, 'node_passed': 41, 'deno_passed': 41,
           'final_node_passed': 7, 'final_deno_passed': 7,
           'max_priorities': 10000, 'provider_page_size': 1000, 'max_pages': 10,
           'live_provider_effects': 0, 'inventory_rows': 118,
           'unchecked_inventory_rows': 60, 'hosted_verification_pending': True,
           'issue_complete': False,
       }, 'issue-56-friend-priority/*.png',
       before=parent_reply_sources(root, sources, parent))
