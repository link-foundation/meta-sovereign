"""Preserve finite desktop-policy reproduction and independently reviewed UI."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs,
    parent_reply_sources, bundle,
)

root, logs, read = evidence_context(__file__, 'vk-desktop')
verify_evidence(read, {
    'before-node': ['fail 1', "- 'desktop-ten-percent'"],
    'before-ui': ['"missingDesktopChoice":true', '"providerEffects":0'],
    'parent': ['all production sources restored.'],
    'node-final': ['pass 43', 'fail 0'],
    'deno-final': ['43 passed | 0 failed'],
    'registry': ['pass 5', 'fail 0'],
    'native-labels': ['"savedPolicy":true', '"lifetimeQuota":true',
                      '"mutualOnly":true', '"unknownRetained":true',
                      '"failedSaveRetained":true', '"syntheticFriendCalls":5',
                      '"messages":0', '"pageErrors":0'],
    'compat-native': ['"priorityFirst":true', '"reviewedActions":true',
                      '"confirmed":true', '"refused":true',
                      '"unknownRetained":true', '"failedSaveRetained":true'],
    'maintenance-native': ['"bothPolicies":true', '"protected":true',
                           '"syntheticDeletes":5', '"messages":0',
                           '"pageErrors":0'],
    'format-final': ['All matched files use Prettier code style!'],
})
raw = json.loads((logs / 'vk-desktop-mcp-result.json').read_text())
summary = json.loads(raw['content'][0]['text'].split('### Result\n')[1].split('\n###')[0])
assert summary['errors'] == [] and summary['liveProvider'] is False
assert [row['language'] for row in summary['result']] == ['en', 'ru', 'hi', 'zh']
assert all(all(row[key] for key in [
    'translated', 'reviewed', 'acknowledged', 'savedChoiceRetained'
]) for row in summary['result'])
assert json.loads(read('mcp-server').splitlines()[-1]) == {
    'syntheticFriendCalls': 8, 'messages': 0, 'liveProvider': False,
    'resourcesClosed': True,
}
shots = list((root / 'docs/screenshots/issue-56-vk-desktop').glob('*.png'))
assert len(shots) == 12
assert all(p.read_bytes().startswith(bytes.fromhex('89504e470d0a1a0a')) for p in shots)
parent = 'f2cf0d6e351ba392431f2cfb6e0f15137c83eab7'
work = changed_sources(root)
receipts = evidence_logs(root, 'vk-desktop')
receipts += [str(p.relative_to(root)) for p in logs.glob('vk-desktop-reference-*.js')]
receipts += [f'ci-logs/vk-friends-schema-{name}.json' for name in [
    'methods', 'responses', 'objects']]
receipts += ['ci-logs/vk-desktop-mcp-code.js',
             'ci-logs/vk-desktop-verified-app.min.js']
bundle(root, work + receipts, 'docs/case-studies/issue-56/data/vk-desktop-policy.tar.gz', {
    'parent': parent, 'parent_failed_assertions': 1, 'node_checks': 43,
    'deno_checks': 43, 'registry_checks': 5, 'native_policy_cases': 1,
    'native_synthetic_friend_actions': 5, 'independent_mcp_languages': 4,
    'synthetic_mcp_friend_actions': 8, 'live_provider_effects': 0,
    'authenticated_provider_sessions': 0, 'hosted_verification_pending': True,
    'issue_complete': False,
}, 'issue-56-vk-desktop/*.png', before=parent_reply_sources(root, work, parent))
