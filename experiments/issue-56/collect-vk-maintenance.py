"""Archive both finite maintenance policies and independently observed controls."""
import json
from evidence_bundle import (
    evidence_context, verify_evidence, changed_sources, evidence_logs,
    parent_reply_sources, bundle,
)

root, logs, read = evidence_context(__file__, 'vk-maintenance')
verify_evidence(read, {
    'before-node': ['fail 1'],
    'before-ui': ['"missingMaintenanceControls":true', '"providerEffects":0'],
    'parent': ['all production sources restored.'],
    'node-final': ['pass 50', 'fail 0'],
    'deno-final': ['48 passed | 0 failed'],
    'registry': ['pass 2', 'fail 0'],
    'native-final': ['"bothPolicies":true', '"protected":true',
                     '"activeKept":true', '"limits":true',
                     '"reviewedDeletes":true', '"uncertaintyRetained":true',
                     '"failedSaveRetained":true', '"syntheticDeletes":5',
                     '"messages":0', '"pageErrors":0'],
    'compat-native': ['"priorityFirst":true', '"reviewedActions":true',
                      '"confirmed":true', '"refused":true',
                      '"unknownRetained":true', '"failedSaveRetained":true',
                      '"messages":0', '"pageErrors":0'],
    'format-final': ['All matched files use Prettier code style!'],
})
for kind in ['cleanup', 'outgoing']:
    raw = json.loads((logs / f'vk-{kind}-mcp-result.json').read_text())
    text = raw['content'][0]['text']
    summary = json.loads(text.split('### Result\n')[1].split('\n###')[0])
    assert summary['errors'] == [] and summary['liveProvider'] is False
    assert [row['language'] for row in summary['result']] == ['en', 'ru', 'hi', 'zh']
    assert all(all(row[key] for key in [
        'translated', 'reviewed', 'acknowledged', 'savedChoiceRetained'
    ]) for row in summary['result'])
server = read('mcp-server').splitlines()
assert json.loads(server[-1]) == {
    'syntheticDeletes': 6, 'messages': 0, 'liveProvider': False, 'resourcesClosed': True,
}
shots = list((root / 'docs/screenshots/issue-56-vk-maintenance').glob('*.png'))
assert len(shots) == 22
assert all(p.read_bytes().startswith(bytes.fromhex('89504e470d0a1a0a')) for p in shots)
parent = '4dca94624c65cb4dd624654baa96cf233483fffe'
work = changed_sources(root)
receipts = evidence_logs(root, 'vk-maintenance')
receipts += [str(p.relative_to(root)) for p in logs.glob('vk-maintenance-reference-*.js')]
receipts += [f'ci-logs/vk-{kind}-mcp-{suffix}' for kind in ['cleanup', 'outgoing']
             for suffix in ['result.json', 'code.js']]
receipts += [f'ci-logs/vk-friends-schema-{name}.json' for name in [
    'methods', 'responses', 'objects']]
receipts += ['ci-logs/vk-online-reference-index.js',
             'ci-logs/vk-maintenance-verified-app.min.js']
bundle(root, work + receipts, 'docs/case-studies/issue-56/data/vk-maintenance.tar.gz', {
    'parent': parent, 'parent_failed_assertions': 1, 'node_checks': 50,
    'deno_checks': 48, 'registry_checks': 2, 'native_both_policy_cases': 1,
    'native_friends_compatibility': 1, 'native_online_compatibility': 1,
    'independent_mcp_languages_per_policy': 4, 'synthetic_mcp_deletes': 6,
    'live_provider_effects': 0, 'authenticated_provider_sessions': 0,
    'hosted_verification_pending': True, 'issue_complete': False,
}, 'issue-56-vk-maintenance/*.png', before=parent_reply_sources(root, work, parent))
