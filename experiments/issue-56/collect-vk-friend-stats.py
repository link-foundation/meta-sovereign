"""Verify finite receipt/statistics regressions and owned browser evidence."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs, bundle,
    parent_reply_sources,
)

root, logs, read = evidence_context(__file__, 'friend-stats')
verify_evidence(read, {
    'node': ['pass 28', 'fail 0', 'cancelled 0'],
    'bun': ['11 pass', '0 fail'],
    'deno': ['11 passed | 0 failed'],
    'before-node': ['1 !== 2', 'fail 1'],
    'format-final': ['All matched files use Prettier code style!'],
})
assert 'SyntaxError' not in read('before-node')
before = json.loads(read('before-ui'))
after = json.loads(read('after-ui'))
assert before == {'missingSummary': True, 'syntheticAcceptances': 2}
assert after['syntheticAcceptances'] == 2 and after['actualProvider'] is False
assert all(after[key] is True for key in ('summaryAfterReceipt', 'staleRetained', 'recovery', 'reload'))
assert after['sharedSurfaces'] == ['VK', 'Chat', 'Operator'] and after['pageErrors'] == 0
inspection = json.loads((logs / 'friend-stats-mcp-result.json').read_text())
mcp = json.loads(inspection['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert [row['language'] for row in mcp['result']] == ['en', 'ru', 'hi', 'zh']
assert all(row['translated'] and row['desktopAndPhoneFit'] and row['accepted'] == 2
           and row['initialCount'] == 1 for row in mcp['result'])
assert mcp['pageErrors'] == [] and mcp['consoleErrors'] == [] and mcp['liveProvider'] is False
assert all(row['error'] == 'net::ERR_ABORTED' and '/api/events?' in row['url']
           for row in mcp['requestFailures'])
assert json.loads(read('mcp-server').splitlines()[-1]) == {
    'resourcesClosed': True, 'syntheticAcceptances': 2, 'messages': 0, 'liveProvider': False,
}
assert len(list((root / 'docs/screenshots/issue-56-friend-stats').glob('*.png'))) == 18
parent = '7205a3c0c7e853a9028274721d6fb285a8ceaefb'
sources = changed_sources(root)
bundle(root, sources + evidence_logs(root, 'friend-stats'),
       'docs/case-studies/issue-56/data/vk-friend-stats.tar.gz', {
           'parent_production': parent, 'node_passed': 28, 'bun_passed': 11,
           'deno_passed': 11, 'native_webkit_cases': 1, 'mcp_languages': 4,
           'live_provider_effects': 0, 'synthetic_acceptances_per_browser_fixture': 2,
           'inventory_rows': 118, 'unchecked_inventory_rows': 60,
           'hosted_verification_pending': True, 'issue_complete': False,
       }, 'issue-56-friend-stats/*.png',
       before=parent_reply_sources(root, sources, parent))
