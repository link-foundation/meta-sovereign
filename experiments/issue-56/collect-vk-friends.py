"""Archive finite friend-plan, receipt, shutdown and control verification."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs,
    parent_reply_sources, bundle,
)

root, logs, read = evidence_context(__file__, 'vk-friends')
requirements = {
    'before-node': ['fail 1'],
    'before-ui': ['"missingFriendControls":true', '"providerEffects":0'],
    'parent': ['every production source restored.'],
    'shutdown-before': ['false !== true', 'fail 1'],
    'node-final': ['pass 36', 'fail 0'],
    'deno-final': ['31 passed | 0 failed'],
    'registry': ['pass 2', 'fail 0'],
    'native-final': ['"priorityFirst":true', '"cap":true',
                     '"reviewedActions":true', '"unknownRetained":true',
                     '"failedSaveRetained":true', '"syntheticFriendCalls":3',
                     '"messages":0', '"pageErrors":0'],
    'online-native-final': ['"confirmed":true', '"refused":true',
                            '"unknownRetained":true', '"mockedProviderCalls":3',
                            '"messages":0', '"pageErrors":0'],
    'format-final': ['All matched files use Prettier code style!'],
}
verify_evidence(read, requirements)
for prefix, effects_key, required_fields in [
    ('vk-friends', 'syntheticFriendCalls', ['reviewed', 'acknowledged', 'savedChoiceRetained']),
    ('vk-friends-online', 'mockedProviderCalls', ['acknowledged', 'savedChoiceRetained']),
]:
    raw = json.loads((logs / f'{prefix}-mcp-result.json').read_text())
    content = raw['content'][0]['text']
    summary = json.loads(content.split('### Result\n')[1].split('\n###')[0])
    assert summary['errors'] == [] and summary['liveProvider'] is False
    assert [row['language'] for row in summary['result']] == ['en', 'ru', 'hi', 'zh']
    for row in summary['result']:
        assert row['translated'] and all(row[key] for key in required_fields)
    server = (logs / f'{prefix}-mcp-server.log').read_text().splitlines()
    assert json.loads(server[-1]) == {
        effects_key: 4, 'messages': 0, 'liveProvider': False, 'resourcesClosed': True,
    }

shots = list((root / 'docs/screenshots/issue-56-vk-friends').glob('*.png'))
assert len(shots) == 22
assert all(p.read_bytes().startswith(bytes.fromhex('89504e470d0a1a0a')) for p in shots)
parent = 'e21ddaa906ff5244a0233814b6a4a37f0fece3ce'
work = changed_sources(root)
receipts = evidence_logs(root, 'vk-friends')
receipts += [str(p.relative_to(root)) for p in logs.glob('vk-friends-reference-*.js')]
receipts += ['ci-logs/vk-friends-verified-app.min.js',
             'ci-logs/vk-friends-mcp-code.js', 'ci-logs/vk-friends-online-mcp-code.js']
bundle(root, work + receipts, 'docs/case-studies/issue-56/data/vk-friends.tar.gz', {
    'parent': parent, 'parent_failed_assertions': 1,
    'shutdown_failed_before': True, 'node_checks': 36, 'deno_checks': 31,
    'registry_checks': 2, 'native_cases': 1, 'native_online_compatibility': 1,
    'independent_mcp_languages': 4, 'online_mcp_compatibility_languages': 4,
    'live_provider_effects': 0, 'authenticated_provider_sessions': 0,
    'hosted_verification_pending': True, 'issue_complete': False,
}, 'issue-56-vk-friends/*.png', before=parent_reply_sources(root, work, parent))
