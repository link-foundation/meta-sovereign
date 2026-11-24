"""Preserve finite discovery evidence without claiming authenticated VK actions."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs,
    parent_reply_sources, bundle,
)

root, logs, read = evidence_context(__file__, 'vk-discovery')
verify_evidence(read, {
    'before-node': ['fail 1', 'discoverySnapshot', 'undefined'],
    'before-ui': ['"missingDiscoveryControls":true', '"liveProvider":false'],
    'node': ['pass 19', 'fail 0'],
    'deno': ['19 passed | 0 failed'],
    'shared-node': ['pass 48', 'fail 0'],
    'shared-deno': ['47 passed | 0 failed | 1 ignored'],
    'native': ['"rankedSuggestion":11', '"communityRequest":7',
               '"deactivatedRejection":21', '"noReplayAfterReload":true',
               '"pageErrors":0', '"liveProvider":false'],
    'format-final': ['All matched files use Prettier code style!'],
})
for name in ['mcp-result', 'mcp-uncached-result']:
    summary = json.loads((logs / f'vk-discovery-{name}.json').read_text())
    assert summary['errors'] == [] and summary['liveProvider'] is False
    assert [row['language'] for row in summary['result']] == ['en', 'ru', 'hi', 'zh']
    assert all(row['translated'] and row['noReplay'] and row['independentPolicies'] == 3
               and row['rankedSuggestion'] == 11 for row in summary['result'])
assert 'Errors: 0, Warnings: 0' in read('mcp-uncached-console')
assert json.loads(read('mcp-server').splitlines()[-1]) == {
    'relationshipEffects': [{'kind': 'add', 'id': 11}],
    'unexpectedMessages': 0, 'liveProvider': False, 'resourcesClosed': True,
}
shots = list((root / 'docs/screenshots/issue-56-vk-discovery').glob('*.png'))
assert len(shots) == 18, len(shots)
assert all(p.read_bytes().startswith(bytes.fromhex('89504e470d0a1a0a')) for p in shots)
for language in ['', '.ru', '.hi', '.zh']:
    assert 'vk-community' in (root / f'docs/VK-FRIEND-DISCOVERY{language}.md').read_text()
parent = 'aae37f2ddd2ad17e9baaa7a0e315db9722ccdd7e'
work = changed_sources(root)
receipts = evidence_logs(root, 'vk-discovery', suffixes=('.log', '.json', '.js', '.png', '.diff'))
bundle(root, work + receipts, 'docs/case-studies/issue-56/data/vk-discovery.tar.gz', {
    'parent': parent, 'parent_failed_assertions': 1,
    'new_feature_checks_per_runtime': 19, 'guide_languages': 4,
    'shared_node_passed': 48, 'shared_deno_passed': 47, 'shared_deno_ignored': 1,
    'native_independent_policies': 3, 'native_relationship_effects': 3,
    'independent_mcp_languages': 4, 'synthetic_mcp_calls': 1,
    'live_provider_effects': 0, 'authenticated_provider_sessions': 0,
    'hosted_verification_pending': True, 'outgoing_message_queue_pending': True,
    'issue_complete': False,
}, 'issue-56-vk-discovery/*.png', before=parent_reply_sources(root, work, parent))
